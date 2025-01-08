export default abstract class SQLParser {
	public static parseStatements(statements: string[]) {
		const parsedStatements: ParsedSQLStatement[] = [];
		
		for (const statement of statements) {
			switch (SQLParser.detectStatementType(statement)) {
				case StatementType.INSERT:
					const insert = SQLParser.decodeInsertStatement(statement);
					
					if (insert != null) {
						parsedStatements.push(insert);
					}
					break;
				
				default:
					console.warn(`Unknown statement type: ${statement}`);
			}
		}
		
		return parsedStatements;
	}
	
	private static detectStatementType(statement: string) {
		let statementType = null;
		
		if (statement.match(/^SELECT/i)) {
			statementType = StatementType.SELECT;
		} else if (statement.match(/^INSERT/i)) {
			statementType = StatementType.INSERT;
		} else if (statement.match(/^UPDATE/i)) {
			statementType = StatementType.UPDATE;
		} else if (statement.match(/^DELETE/i)) {
			statementType = StatementType.DELETE;
		} else if (statement.match(/^CREATE TABLE/i)) {
			statementType = StatementType.CREATE_TABLE;
		} else if (statement.match(/^DROP TABLE/i)) {
			statementType = StatementType.DROP_TABLE;
		} else if (statement.match(/^ALTER TABLE/i)) {
			statementType = StatementType.ALTER_TABLE;
		}
		
		return statementType;
	}
	
	private static decodeInsertStatement(statement: string) {
		const insertStatement: ParsedSQLStatement = {
			original: statement,
			type: StatementType.INSERT,
			priority: null
		};
		
		// Remove INSERT
		statement = statement.replace(/^INSERT /i, '');
		
		// Look for [LOW_PRIORITY | DELAYED | HIGH_PRIORITY] [IGNORE]
		if ((/^LOW_PRIORITY/i).test(statement)) { insertStatement.priority = 'LOW_PRIORITY'; }
		if ((/^DELAYED/i).test(statement)) { insertStatement.priority = 'DELAYED'; }
		if ((/^HIGH_PRIORITY/i).test(statement)) { insertStatement.priority = 'HIGH_PRIORITY'; }
		
		// Look for INTO
		const intoIndex = statement.indexOf('into');
		
		if (intoIndex === -1) {
			console.error('No INTO found in INSERT statement:', statement);
			return null;
		} else {
			statement = statement.substring(intoIndex + 4);
			
			// Get table name
			const valuesIndex = statement.toLowerCase().indexOf(' values');
			const setIndex = statement.toLowerCase().indexOf(' set');
			const paranIndex = statement.indexOf('(');
			
			if (paranIndex > -1 && (valuesIndex > -1 && paranIndex < valuesIndex || setIndex > -1 && paranIndex < setIndex)) {
				insertStatement.tableName = statement.substring(0, paranIndex).trim();
				insertStatement.columns = SQLParser.extractCSV(statement.substring(paranIndex + 1, statement.indexOf(')')));
			} else {
				insertStatement.columns = null;
			}
			
			if (valuesIndex > -1) {
				SQLParser.insertStatementValueOrSetProcessor(insertStatement, statement, true, paranIndex, valuesIndex);
			} else if (setIndex > -1) {
				SQLParser.insertStatementValueOrSetProcessor(insertStatement, statement, false, paranIndex, setIndex);
			} else {
				console.error('No VALUES or SET found in INSERT statement:', statement);
				return null;
			}
			
			return insertStatement;
		}
	}
	
	private static insertStatementValueOrSetProcessor = (
		insertStatment: ParsedSQLStatement,
		partialSQLStatement: string,
		isValue: boolean,
		paranIndex: number,
		valueOrSetIndex: number
	) => {
		if (paranIndex == -1) {
			insertStatment.tableName = partialSQLStatement.substring(0, valueOrSetIndex).trim();
		} else {
			if (paranIndex < valueOrSetIndex) {
				insertStatment.tableName = partialSQLStatement.substring(0, paranIndex).trim();
			} else {
				insertStatment.tableName = partialSQLStatement.substring(0, valueOrSetIndex).trim();
			}
		}
		
		const valueOrSet = partialSQLStatement.substring(valueOrSetIndex + (isValue ? 7 : 4)).trim();
		const rowAliasIndex = valueOrSet.toLowerCase().indexOf('as');
		const duplicateKeyIndex = valueOrSet.toLowerCase().indexOf('on duplicate key update');
		
		if (rowAliasIndex == -1 && duplicateKeyIndex == -1) {
			if (isValue) {
				// Values is by itself
				insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, valueOrSet.length - 1));
			} else {
				// Set is by itself
				insertStatment.set = SQLParser.extractKVP(valueOrSet);
			}
		} else {
			// Values or Set has an alias or duplicate key
			if (rowAliasIndex > -1) {
				let rowAlias = '';
				
				// Row alias found
				if (duplicateKeyIndex == -1) {
					// But no duplicate key
					rowAlias = valueOrSet.substring(rowAliasIndex + 3);
					
					if (isValue) {
						insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, rowAliasIndex - 2));
					} else {
						insertStatment.set = SQLParser.extractKVP(valueOrSet.substring(0, rowAliasIndex - 1));
					}
				} else {
					// But has duplicate key
					if (rowAliasIndex < duplicateKeyIndex) {
						// Row alias is before duplicate key
						rowAlias = valueOrSet.substring(rowAliasIndex + 3, duplicateKeyIndex);
						
						if (isValue) {
							insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, rowAliasIndex - 2));
						} else {
							insertStatment.set = SQLParser.extractKVP(valueOrSet.substring(0, rowAliasIndex - 1));
						}
					} else {
						// Row alias is after duplicate key
						rowAlias = valueOrSet.substring(rowAliasIndex + 3);
						
						if (isValue) {
							insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, duplicateKeyIndex - 2));
						} else {
							insertStatment.set = SQLParser.extractKVP(valueOrSet.substring(0, duplicateKeyIndex - 1));
						}
					}
				}
				
				// Extract row alias and columns
				insertStatment.rowAlias = rowAlias.substring(0, rowAlias.indexOf('(')).trim();
				insertStatment.rowAliasColumns = SQLParser.extractCSV(rowAlias.substring(rowAlias.indexOf('(') + 1, rowAlias.indexOf(')')));
			}
			
			if (duplicateKeyIndex > -1) {
				// Duplicate key found
				if (rowAliasIndex == -1) {
					// No row alias
					insertStatment.onDuplicateKeyUpdate = SQLParser.extractKVP(valueOrSet.substring(duplicateKeyIndex + 23).trim());
					
					if (isValue) {
						insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, duplicateKeyIndex - 2));
					} else {
						insertStatment.set = SQLParser.extractKVP(valueOrSet.substring(0, duplicateKeyIndex - 1));
					}
				} else {
					// Has row alias
					if (duplicateKeyIndex < rowAliasIndex) {
						// Duplicate key is before row alias
						insertStatment.onDuplicateKeyUpdate = SQLParser.extractKVP(valueOrSet.substring(duplicateKeyIndex + 23, rowAliasIndex).trim());
						
						if (isValue) {
							insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, duplicateKeyIndex - 2));
						} else {
							insertStatment.set = SQLParser.extractKVP(valueOrSet.substring(0, duplicateKeyIndex - 1));
						}
					} else {
						// Duplicate key is after row alias
						insertStatment.onDuplicateKeyUpdate = SQLParser.extractKVP(valueOrSet.substring(duplicateKeyIndex + 23).trim());
						
						if (isValue) {
							insertStatment.values = SQLParser.extractCSV(valueOrSet.substring(1, rowAliasIndex - 2));
						} else {
							insertStatment.set = SQLParser.extractKVP(valueOrSet.substring(0, rowAliasIndex - 1));
						}
					}
				}
			}
		}
	}
	
	private static extractCSV(str: string) {
		const columns: string[] = [];
		let currentColumn = '';
		let inQuotes = false;
		
		for (let i = 0; i < str.length; i++) {
			const char = str[i];
			
			if (char === ',' && !inQuotes) {
				columns.push(currentColumn.trim());
				currentColumn = '';
				continue;
			} else if (char === "'" || char === '"') {
				inQuotes = !inQuotes;
			}
			
			currentColumn += char;
		}
		
		columns.push(currentColumn.trim());
		
		return columns;
	}
	
	private static extractKVP(str: string) {
		const items = str.trim().replace(/\s=\s/g, '=').split(','); // TODO Improve the split to handle commas within quotes
		const kvp: { [key: string]: string } = {};
		
		for (const item of items) {
			const parts = item.split('=');
			kvp[parts[0].trim()] = parts[1].trim();
		}
		
		return kvp;
	}
}

enum StatementType {
	SELECT = 1,
	INSERT,
	UPDATE,
	DELETE,
	CREATE_TABLE,
	DROP_TABLE,
	ALTER_TABLE,
};

interface ParsedSQLStatement {
	original: string;
	type: StatementType;
	priority?: 'LOW_PRIORITY' | 'DELAYED' | 'HIGH_PRIORITY' | null;
	tableName?: string;
	columns?: string[] | null;
	values?: ValidSQLDataTypes[] | null;
	rowAlias?: string;
	rowAliasColumns?: string[];
	onDuplicateKeyUpdate?: { [key: string]: string };
	set?: { [key: string]: string };
}

type ValidSQLDataTypes = string | number | boolean | null | Date | object;
