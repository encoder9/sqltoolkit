export default abstract class SQLTokeniser {
	public static parseStatements(sqlStatements: string[]) {
		const parsed: ParsedSQLStatement[] = [];
		
		for (const sql of sqlStatements) {
			parsed.push(SQLTokeniser.tokenise(sql));
		}
		
		return parsed;
	}
	
	public static tokenise(sql: string) {
		let currentToken = '';
		
		const statement: ParsedSQLStatement = {
			original: sql,
			lookingFor: SQLComponent.STATEMENT_TYPE,
			values: [],
		};
		
		for (let i = 0; i < sql.length; i++) {
			const char = sql[i];
			currentToken += char;
			
			if (SQLTokeniser.processToken(currentToken, statement, i === sql.length - 1)) {
				currentToken = '';
			}
		}
		
		return statement;
	}
	
	private static processToken(token: string, statement: ParsedSQLStatement, isEnd = false) {
		const upper = token.toUpperCase();
		
		if (statement.lookingFor! & SQLComponent.STATEMENT_TYPE && statement.statementType == null && SQLTokeniser.checkForStatementType(upper, statement)) { return true; }
		else if (statement.lookingFor! & SQLComponent.TABLE_NAME && SQLTokeniser.checkForTableName_AndColumns(upper, token, statement)) { return true; }
		else if (statement.lookingFor! & SQLComponent.VALUE_LIST && SQLTokeniser.checkForValues(token, statement)) { return true; }
		else if (statement.lookingFor! & SQLComponent.SET && SQLTokeniser.checkForSet(upper, token, statement, isEnd)) { return true; }
		else if (statement.lookingFor! & SQLComponent.ROW_ALIAS && SQLTokeniser.checkForRowAlias(upper, token, statement)) { return true; }
		else if (statement.lookingFor! & SQLComponent.ON_DUPLICATE_KEY_UPDATE && SQLTokeniser.checkForOnDuplicateKeyUpdate(token, statement, isEnd)) { return true; }
		else if (statement.lookingFor! & SQLComponent.END_OF_STATEMENT && isEnd) { return true; }
		else { return false; }
	}
	
	private static checkForStatementType(token: string, statement: ParsedSQLStatement) {
		let found = true;
		
		if (token === 'SELECT') { statement.statementType = Keyword.SELECT; }
		else if (token === 'INSERT INTO') { statement.statementType = Keyword.INSERT; statement.lookingFor = SQLComponent.TABLE_NAME; }
		else if (token === 'UPDATE') { statement.statementType = Keyword.UPDATE; }
		else if (token === 'DELETE') { statement.statementType = Keyword.DELETE; }
		else { found = false; }
		
		return found;
	}
	
	private static checkForTableName_AndColumns(upper: string, token: string, statement: ParsedSQLStatement) {
		if (statement.statementType === Keyword.INSERT) {
			if (upper.includes('VALUES')) {
				const parsed = token.substring(0, upper.indexOf('VALUES')).trim();
				
				if (parsed.includes('(')) {
					statement.tableName = parsed.substring(0, parsed.indexOf('(')).trim();
					statement.columns = SQLTokeniser.extractCSV(parsed.substring(parsed.indexOf('(') + 1, parsed.indexOf(')')));
				} else {
					statement.tableName = parsed;
				}
				
				statement.lookingFor = SQLComponent.VALUE_LIST;
				return true;
			} else if (upper.includes('SET')) {
				const parsed = token.substring(0, upper.indexOf('SET')).trim();
				
				if (parsed.includes('(')) {
					statement.tableName = parsed.substring(0, parsed.indexOf('(')).trim();
					statement.columns = SQLTokeniser.extractCSV(parsed.substring(parsed.indexOf('(') + 1, parsed.indexOf(')')));
				} else {
					statement.tableName = parsed;
				}
				
				statement.lookingFor = SQLComponent.SET;
				return true;
			}
		}
		
		return false;
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
	
	private static extractList(str: string) {
		let list = '';
		let inQuotes = false;
		
		for (let i = 0; i < str.length; i++) {
			const char = str[i];
			
			if (i == 0 && char === ' ' && !inQuotes) {
				continue;
			} else if (char === "'" || char === '"') {
				inQuotes = !inQuotes;
			}
			
			list += char;
		}
		
		return (list.startsWith('(') && list.endsWith(')') && !inQuotes) ? list : null;
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
	
	private static checkForValues(token: string, statement: ParsedSQLStatement) {
		if (statement.statementType === Keyword.INSERT) {
			const list = SQLTokeniser.extractList(token);
			
			if (list != null) {
				const parsed = list.trim();
				statement.values = SQLTokeniser.extractCSV(parsed.substring(1, parsed.length - 1));
				statement.lookingFor = SQLComponent.ROW_ALIAS;
				return true;
			}
		}
		
		return false;
	}
	
	private static checkForRowAlias(upper: string, token: string, statement: ParsedSQLStatement) {
		console.log(`T>>${token}<<`);
		
		if (token.startsWith(' AS ')) {
			if (token.length > 4) {
				if (token.toUpperCase().endsWith('ON')) {
					const parsed = token.trim().replace('AS ', '').replace('as ', '');
					
					if (parsed.includes('(')) {
						statement.rowAlias = parsed.substring(0, parsed.indexOf('(')).trim();
						statement.rowAliasColumns = SQLTokeniser.extractCSV(parsed.substring(parsed.indexOf('(') + 1, parsed.indexOf(')')));
					} else {
						statement.rowAlias = parsed.replace(' ON', '').replace(' on', '').trim();
					}
					
					statement.lookingFor = SQLComponent.ON_DUPLICATE_KEY_UPDATE;
					return true;
				}
			}
		}
	}
	
	private static checkForOnDuplicateKeyUpdate(token: string, statement: ParsedSQLStatement, isEnd: boolean) {
		if (isEnd) {
			statement.onDuplicateKeyUpdate = SQLTokeniser.extractKVP(token.trim().substring(21));
			statement.lookingFor = SQLComponent.END_OF_STATEMENT;
			return true;
		}
	}
	
	private static checkForSet(upper: string, token: string, statement: ParsedSQLStatement, isEnd: boolean) {
		if (statement.statementType === Keyword.INSERT) {
			let parsed = '';
			
			if (upper.includes(' AS')) {
				parsed = token.substring(0, upper.indexOf(' AS')).trim();
			} else if (upper.includes(' ON')) {
				parsed = token.substring(0, upper.indexOf(' ON')).trim();
			} else if (isEnd) {
				parsed = token.trim();
			}
			
			if (parsed != '') {
				console.log(`S>>${token}<<`);
				
				statement.set = SQLTokeniser.extractKVP(parsed);
				statement.lookingFor = SQLComponent.ROW_ALIAS;
				return true;
			}
		}
	}
}

enum Keyword {
	SELECT = 1,
	INSERT = 2,
	UPDATE = 3,
	DELETE = 4,
	FROM = 5,
	WHERE = 6,
	ORDER = 7,
	BY = 8,
	GROUP = 9,
	HAVING = 10,
	LIMIT = 11,
	OFFSET = 12,
	VALUES = 13,
	SET = 14,
	JOIN = 15,
	LEFT = 16,
	RIGHT = 17,
	INNER = 18,
	OUTER = 19,
	CROSS = 20,
	UNION = 21,
	ALL = 22,
	DISTINCT = 23,
	AS = 24,
	ON = 25,
	AND = 26,
	OR = 27,
	NOT = 28,
	NULL = 29,
	TRUE = 30,
	FALSE = 31,
	IS = 32,
	IN = 33,
	LIKE = 34,
	BETWEEN = 35,
	EXISTS = 36,
	ANY = 37,
	SOME = 38,
}

enum SQLComponent {
	COLUMN_LIST = 1,
	TABLE_NAME = 2,
	VALUE_LIST = 4,
	STATEMENT_TYPE = 8,
	ROW_ALIAS = 16,
	END_OF_STATEMENT = 32,
	ON_DUPLICATE_KEY_UPDATE = 64,
	SET = 128,
}

interface ParsedSQLStatement {
	original?: string;
	statementType?: Keyword | null;
	lookingFor?: number | null;
	tableName?: string | null;
	columns?: string[];
	values: ValidSQLDataTypes[];
	rowAlias?: string | null;
	rowAliasColumns?: string[] | null;
	onDuplicateKeyUpdate?: { [key: string]: string };
	set?: { [key: string]: string };
}

type ValidSQLDataTypes = string | number | boolean | null | Date | object;
