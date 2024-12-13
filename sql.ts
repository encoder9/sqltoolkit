import mysql from "mysql2/promise"; // MySQL client for SQL execution
import { readFileSync } from 'fs';
import Log from "./log";
import type { Column, InsertStatement, KVP, SQLDataType, Statement, Table } from "./interfaces";

export default abstract class SQL {
	//#region SQL File Operations
	
	public static async getStatements(filePath: string) {
		const statements = await SQL.readSQLFile(filePath);
		return SQL.validateSQL(statements) ? statements : null;
	}
	
	private static async readSQLFile(filePath: string): Promise<string[]> {
		let fileContents = '';
		
		try {
			fileContents = readFileSync(filePath, 'utf-8');
		} catch (error: any) {
			Log.error(`Error reading file: ${error.message}`, 0, 0);
			throw error;
		}
		
		return fileContents.split(/;\s*$/m).map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);
	}
	
	private static validateSQL(statements: string[]) {
		for (const statement of statements) {
			if (
				!statement.toLowerCase().startsWith('select') &&
				!statement.toLowerCase().startsWith('insert') &&
				!statement.toLowerCase().startsWith('update') &&
				!statement.toLowerCase().startsWith('delete') &&
				!statement.toLowerCase().startsWith('create') &&
				!statement.toLowerCase().startsWith('drop') &&
				!statement.toLowerCase().startsWith('alter') &&
				!statement.toLowerCase().startsWith('-') &&
				!statement.toLowerCase().startsWith('truncate')
			) {
				Log.error(`Potentially invalid SQL statement: ${statement}`, 0, 0);
				process.exit(1);
			}
		}
		
		return true;
	}
	
	//#endregion
	
	//#region SQL Execution Operations
	
	public static async processSQLStatement(sql: string, connection: mysql.Connection, index: number, length: number) {
		const parts = sql.split(' ');
		const command = parts[0].toLowerCase();
		
		if (command == 'select') { await SQL.processSelect(sql, connection, index, length); }
		else if (command == 'insert') { await SQL.processInsert(sql, connection, index, length, parts); }
		else if (command == 'update') { await SQL.processUpdate(sql, connection, index, length, parts); }
		else if (command == 'delete') { await SQL.processDelete(sql, connection, index, length, parts); }
		else if (command == 'create') { await SQL.processCreate(sql, connection, index, length, parts); }
		else if (command == 'drop') { await SQL.processDrop(sql, connection, index, length, parts); }
		else if (command == 'alter') { await SQL.processAlter(sql, connection, index, length, parts); }
		else if (command == 'truncate') { await SQL.processTruncate(sql, connection, index, length, parts); }
		// else { Log.info(`Unsupported SQL command: ${command}`, index, length); }
	}
	
	private static convertToCorrectDataType(value: string) {
		let convertedValue = null;
		value = value.replace(/,$/, '');
		
		if (value.includes("'") || value.includes('"')) {
			convertedValue = value;
		} else if (value == 'null') {
			convertedValue = null;
		} else {
			let numericValue = 0;
			try { numericValue = parseFloat(value); } catch (error: any) {}
			
			if (isNaN(numericValue)) { convertedValue = value; }
			else { convertedValue = numericValue; }
		}
		
		return convertedValue;
	}
	
	private static extractValuesList(parts: string[], firstPartName: string, shouldDequoteNextPart: boolean) {
		const extractedValues: any[] = [];
		
		if (firstPartName.includes(')')) {
			if (firstPartName.includes("'") || firstPartName.includes('"')) {
				const quotedString = SQL.extractQuotedStrings(parts, firstPartName);
				console.log(quotedString);
				
				extractedValues.push(SQL.convertToCorrectDataType(quotedString.replace(')', '')));
			} else {
				extractedValues.push(SQL.convertToCorrectDataType(firstPartName.replace(')', '')));
			}
		} else {
			extractedValues.push(SQL.convertToCorrectDataType(firstPartName));
			let finishedPart = false;
			let nextPart = parts.shift() || '';
			
			while (!finishedPart) {
				let partName = shouldDequoteNextPart ? nextPart.replace(/`|'/g, '') : nextPart;
				
				if (partName.includes("'") || partName.includes('"')) {
					partName = SQL.extractQuotedStrings(parts, partName);
				}
				
				if (partName.includes(')')) {
					extractedValues.push(SQL.convertToCorrectDataType(partName.replace(')', '')));
					finishedPart = true;
				} else {
					extractedValues.push(SQL.convertToCorrectDataType(partName));
					nextPart = parts.shift() || '';
				}
			}
		}
		
		return extractedValues;
	}
	
	private static extractQuotedStrings(parts: string[], firstPartName: string) {
		const stringParts: string[] = [firstPartName.replace(/^'|"/, '')];
		let keepProcessing = true;
		
		while (keepProcessing) {
			const part = parts.shift() || '';
			
			if (part.includes("'") || part.includes('"')) {
				stringParts.push(part.replace(/,$/, '').replace(/'|"$/, ''));
				keepProcessing = false;
			} else {
				stringParts.push(part);
			}
		}
		
		return stringParts.join(' ');
	}
	
	private static extractKVP(parts: string[]) {
		const extractedKVP: { [key: string]: string }[] = [];
		
		while (parts.length > 0) {
			const key = parts[0].replace(/`|'/g, '');
			const value = parts[2].replace(/`|'/g, '').replace(',', '');
			parts.shift();
			parts.shift();
			parts.shift();
			
			extractedKVP.push({ [key]: value });
			
			if ((parts.length % 3) > 0) { break; }
		}
		
		return extractedKVP;
	}
	
	private static async getTableMetadata(connection: mysql.Connection, tableName: string) {
		const table: Table = {
			name: tableName,
			columns: [],
			rowCount: 0
		};
		
		const [tableResults] = await connection.query(`SELECT TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = '${tableName}';`);
		
		if (Array.isArray(tableResults) && tableResults.length > 0) {
			table.rowCount = (<any>tableResults[0]).TABLE_ROWS;
			const [columnResults] = await connection.query(`SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, COLUMN_TYPE, COLUMN_KEY, EXTRA FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' ORDER BY ORDINAL_POSITION;`);
			
			if (Array.isArray(columnResults) && columnResults.length > 0) {
				columnResults.forEach((column: any) => {
					table.columns.push({
						name: column.COLUMN_NAME,
						ordinal: column.ORDINAL_POSITION - 1,		// MySQL is 1-based, so we need to convert to 0-based
						default: column.COLUMN_DEFAULT,
						nullable: Boolean(column.IS_NULLABLE),
						type: column.DATA_TYPE.toLowerCase(),
						length: column.CHARACTER_MAXIMUM_LENGTH,
						precision: column.NUMERIC_PRECISION,
						columnType: column.COLUMN_TYPE,
						key: column.COLUMN_KEY,
						extra: column.EXTRA
					});
				});
			}
		}
		
		return table;
	}
	
	private static getMySQLDataTypes_ByPrimitive(primitiveType: string) {
		const dataTypes: string[] = [];
		
		switch (primitiveType) {
			case 'string':
				dataTypes.push('char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext', 'binary', 'varbinary', 'tinyblob', 'mediumblob', 'longblob', 'enum', 'set');
				break;
				
			case 'number':
				dataTypes.push('tinyint', 'smallint', 'mediumint', 'int', 'integer', 'bigint', 'float', 'double', 'decimal', 'numeric');
				break;
				
			case 'boolean':
				dataTypes.push('bit');
				break;
				
			case 'date':
				dataTypes.push('date', 'time', 'datetime', 'timestamp', 'year');
				break;
		}
		
		return dataTypes;
	}
	
	//#endregion
	
	//#region SELECT
	
	private static async processSelect(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number): Promise<void> {
		try {
			const [results, fields] = await connection.query(sql);
			Log.info(`Query Results: ${results}`, sqlStatementIndex, sqlStatementTotal);
		} catch (error) {
			Log.error(`Error executing query: ${error}`, sqlStatementIndex, sqlStatementTotal);
		}
	}
	
	//#endregion
	
	//#region INSERT
	
	private static async processInsert(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		/*
			Inserts can be broken down into the following:
				- insert into values
				- insert into select
				
			The following tests will be done for the INSERT INTO VALUES command:
				- Check if the table exists
					- If it does
						- Check the values component and break it into () groups. For every group:
							- Check if the values match the table columns and data types for each column
								- If they do
									- If the table has a primary key and the values for the primary key fields are null
										- Do a select query for all the NON-primary key fields to see if the record already exists
											- If it does, log that the record already exists
											- If it does not, insert the record
									- If the table does not have a primary key
										- Do a select query for all the fields to see if the record already exists
											- If it does, log that the record already exists
											- If it does not, insert the record
								- If they do not, log that the values do not match the table columns and data types
					- If it does not, log that the table does not exist
			
			The following tests will be done for the INSERT INTO SELECT command:
				- Check if the table exists
					- If it does
						- Run the select statement and for every returned value
							- Check if the record already exists
								- If it does, log that the record already exists
								- If it does not
									- Check if the values match the table columns and data types for each column
										- If they do
											- If the table has a primary key and the values for the primary key fields are null
												- Do a select query for all the NON-primary key fields to see if the record already exists
													- If it does, log that the record already exists
													- If it does not, insert the record
											- If the table does not have a primary key
												- Do a select query for all the fields to see if the record already exists
													- If it does, log that the record already exists
													- If it does not, insert the record
										- If they do not, log that the values do not match the table columns and data types
					- If it does not, log that the table does not exist
		*/
		
		const insertStatement = SQL.decodeInsertStatement(sql);
		
		// Check if the table exists
		if (await SQL.checkTableExists(connection, insertStatement.tableName)) {
			const table = await SQL.getTableMetadata(connection, insertStatement.tableName);
			
			// Determine if it's an INSERT INTO VALUES or INSERT INTO SELECT
			if (insertStatement.selectStatement === '') {
				// INSERT INTO VALUES
				if (insertStatement.values.length > 0) {
					const valuesMatch = await SQL.checkValuesMatch_SQLDataType(table, insertStatement.values, sqlStatementIndex, sqlStatementTotal);
					
					if (valuesMatch) {
						// insert into roles values (null, 'Dummy Role', 0, 0);
						const pkFields = table.columns.filter(column => column.key === 'PRI');
						let pkFieldsAreNull = false;
						
						for (const field of pkFields) {
							if (insertStatement.values[field.ordinal] === null) {
								pkFieldsAreNull = true;
								break;
							}
						}
						
						if (pkFieldsAreNull) {
							const recordExists = await SQL.checkRecordExists(connection, table, insertStatement, true);
							
							// if (recordExists) {
							// 	console.log(`Record already exists in table ${insertStatement.tableName}`);
							// } else {
							// 	await SQL.insertRecord(connection, insertStatement.tableName, valuesGroup);
							// }
						} else {
							console.log('Got data for primary key fields');
							
							// const recordExists = await SQL.checkRecordExists(connection, insertStatement.tableName, valuesGroup, primaryKeyFields, true);
							// if (recordExists) {
							// 	console.log(`Record already exists in table ${insertStatement.tableName}`);
							// } else {
							// 	await SQL.insertRecord(connection, insertStatement.tableName, valuesGroup);
							// }
						}
					}
				}
				
				// if (insertStatement.valuesKVP.length > 0) {
				// 	for (const valuesGroup of valuesGroups) {
				// 		const valuesMatch = await SQL.checkValuesMatch(connection, insertStatement.tableName, valuesGroup);
				// 		if (!valuesMatch) {
				// 			console.log(`Values do not match the table columns and data types for table ${insertStatement.tableName}`);
				// 			continue;
				// 		}
			
				// 		const primaryKeyFields = await SQL.getPrimaryKeyFields(connection, insertStatement.tableName);
				// 		const primaryKeyValues = SQL.extractPrimaryKeyValues(valuesGroup, primaryKeyFields);
			
				// 		if (primaryKeyValues.some(value => value === null)) {
				// 			const recordExists = await SQL.checkRecordExists(connection, insertStatement.tableName, valuesGroup, primaryKeyFields, false);
				// 			if (recordExists) {
				// 				console.log(`Record already exists in table ${insertStatement.tableName}`);
				// 			} else {
				// 				await SQL.insertRecord(connection, insertStatement.tableName, valuesGroup);
				// 			}
				// 		} else {
				// 			const recordExists = await SQL.checkRecordExists(connection, insertStatement.tableName, valuesGroup, primaryKeyFields, true);
				// 			if (recordExists) {
				// 				console.log(`Record already exists in table ${insertStatement.tableName}`);
				// 			} else {
				// 				await SQL.insertRecord(connection, insertStatement.tableName, valuesGroup);
				// 			}
				// 		}
				// 	}
				// }
			// } else if (sql.toLowerCase().includes('select')) {
			// 	// INSERT INTO SELECT
			// 	const selectResults = await SQL.runSelectStatement(connection, sql);
			// 	for (const result of selectResults) {
			// 		const recordExists = await SQL.checkRecordExists(connection, insertStatement.tableName, result, [], true);
			// 		if (recordExists) {
			// 			console.log(`Record already exists in table ${insertStatement.tableName}`);
			// 		} else {
			// 			const valuesMatch = await SQL.checkValuesMatch(connection, insertStatement.tableName, result);
			// 			if (!valuesMatch) {
			// 				console.log(`Values do not match the table columns and data types for table ${insertStatement.tableName}`);
			// 				continue;
			// 			}
		
			// 			const primaryKeyFields = await SQL.getPrimaryKeyFields(connection, insertStatement.tableName);
			// 			const primaryKeyValues = SQL.extractPrimaryKeyValues(result, primaryKeyFields);
		
			// 			if (primaryKeyValues.some(value => value === null)) {
			// 				const recordExists = await SQL.checkRecordExists(connection, insertStatement.tableName, result, primaryKeyFields, false);
			// 				if (recordExists) {
			// 					console.log(`Record already exists in table ${insertStatement.tableName}`);
			// 				} else {
			// 					await SQL.insertRecord(connection, insertStatement.tableName, result);
			// 				}
			// 			} else {
			// 				const recordExists = await SQL.checkRecordExists(connection, insertStatement.tableName, result, primaryKeyFields, true);
			// 				if (recordExists) {
			// 					console.log(`Record already exists in table ${insertStatement.tableName}`);
			// 				} else {
			// 					await SQL.insertRecord(connection, insertStatement.tableName, result);
			// 				}
			// 			}
			// 		}
			// 	}
			}
		} else {
			Log.error(`Table ${insertStatement.tableName} does not exist`, sqlStatementIndex, sqlStatementTotal, insertStatement);
		}
	}
	
	private static async checkTableExists(connection: mysql.Connection, tableName: string): Promise<boolean> {
		const query = `SHOW TABLES LIKE '${tableName}'`;
		const [results] = await connection.query(query);
		
		if (Array.isArray(results) && results.length > 0) {
			return true;
		} else {
			return false;
		}
	}
	
	private static async checkValuesMatch_SQLDataType(table: Table, values: SQLDataType[], sqlStatementIndex: number, sqlStatementTotal: number): Promise<boolean> {
		// Check if the values match the table columns and data types for each column
		const errorMessages: string[] = [];
		let valuesMatch = true;
		
		for (let i = 0; i < table.columns.length; i++) {
			if (values[i] == null) {
				if (!table.columns[i].nullable) {
					errorMessages.push(`Value for column ${table.columns[i].name} is missing`);
					valuesMatch = false;
				}
			} else {
				if (typeof values[i] == 'string' && !SQL.getMySQLDataTypes_ByPrimitive('string').includes(table.columns[i].type)) {
					errorMessages.push(`Value for column ${table.columns[i].name} is a string but the column type is ${table.columns[i].type}`);
					valuesMatch = false;
				} else if (typeof values[i] == 'number' && !SQL.getMySQLDataTypes_ByPrimitive('number').includes(table.columns[i].type)) {
					errorMessages.push(`Value for column ${table.columns[i].name} is a number but the column type is ${table.columns[i].type}`);
					valuesMatch = false;
				} else if (typeof values[i] == 'boolean' && !SQL.getMySQLDataTypes_ByPrimitive('boolean').includes(table.columns[i].type)) {
					errorMessages.push(`Value for column ${table.columns[i].name} is a boolean but the column type is ${table.columns[i].type}`);
					valuesMatch = false;
				}
			}
		}
		
		if (errorMessages.length > 0) {
			for (const errorMessage of errorMessages) { Log.error(errorMessage, sqlStatementIndex, sqlStatementTotal); }
		}
		
		return valuesMatch;
	}
	
	private static async checkRecordExists(connection: mysql.Connection, table: Table, statement: Statement, isInsert: boolean): Promise<boolean> {
		let recordExists = false;
		
		if (isInsert) {
			const primaryKeyFields = table.columns.filter(column => column.key === 'PRI');
			const nonPKColumns = table.columns.filter(column => column.key !== 'PRI');
			const nonPKColumnNames = nonPKColumns.map(column => column.name);
			const nonPKColumnValues = statement.values.filter((value, index) => nonPKColumnNames.includes(table.columns[index].name));
			const nonPKWhere = [];
			
			for (let i = 0; i < nonPKColumns.length; i++) {
				if (typeof nonPKColumnValues[i] == 'string') {
					nonPKWhere.push(`${nonPKColumns[i].name} = ${mysql.escape(nonPKColumnValues[i])}`);
				} else {
					nonPKWhere.push(`${nonPKColumns[i].name} = ${nonPKColumnValues[i]}`);
				}
			}
			
			const query = `SELECT ${primaryKeyFields.map(column => `${column.name}`).join(', ')} FROM ${table.name} WHERE ${nonPKWhere.join(' AND ')};`;
			const [results] = await connection.query(query);
			if (Array.isArray(results) && results.length > 0) { recordExists = true; }
		}
		
		console.log(recordExists);
		
		
		return recordExists;
	}
	
	// private static async insertRecord(connection: mysql.Connection, tableName: string, valuesGroup: string): Promise<void> {
	// 	// Implementation to insert record into the table
	// }
	
	// private static async runSelectStatement(connection: mysql.Connection, sql: string): Promise<any[]> {
	// 	// Implementation to run select statement and return results
	// }
	
	private static decodeInsertStatement(sql: string) {
		const insertStatement: InsertStatement = {
			tableName: '',
			partitionNames: [],
			columnNames: [],
			values: [],
			rowAliases: [],
			onDuplicateKeyUpdate: [],
			valuesKVP: [],
			selectStatement: ''
		};
		
		sql = sql.replace(/\s+/g, ' ').trim();
		
		const parts = sql.split(' ');
		
		// Part = INSERT
		if (parts[0] !== undefined && parts[0].toLowerCase() == 'insert') {
			parts.shift();
			
			// Part = [LOW_PRIORITY | DELAYED | HIGH_PRIORITY] [IGNORE] [INTO]
			if (
				parts[0] !== undefined && (
					parts[0].toLowerCase() == 'low_priority' ||
					parts[0].toLowerCase() == 'delayed' ||
					parts[0].toLowerCase() == 'high_priority' ||
					parts[0].toLowerCase() == 'ignore' ||
					parts[0].toLowerCase() == 'into'
				)
			) {
				parts.shift();
				
				// Part = tbl_name
				insertStatement.tableName = parts.shift()?.replace(/`/g, '') || '';
				
				// Part = [PARTITION (partition_name [, partition_name] ...)]
				if (parts[0] !== undefined && parts[0].toLowerCase() == 'partition') {
					parts.shift();
					const firstPart = parts.shift() || '';
					const firstPartName = (firstPart.substring(1, firstPart.length) || '').replace(/`|'/g, '');
					insertStatement.partitionNames = SQL.extractValuesList(parts, firstPartName, true);
				}
				
				// Part = [(col_name [, col_name] ...)]
				if (parts[0] !== undefined && parts[0].includes('(')) {
					const firstColumn = (parts.shift() || '').replace('(', '').replace(/`|'/g, '');
					insertStatement.columnNames = SQL.extractValuesList(parts, firstColumn, true);
				}
				
				// Part = { {VALUES | VALUE} (value_list) [, (value_list)] ... }
				if (parts[0] !== undefined && parts[0].toLowerCase() == 'values') {
					parts.shift();
					const firstValue = (parts.shift() || '').replace('(', '');
					insertStatement.values = SQL.extractValuesList(parts, firstValue, false);
				}
				
				// Part = SET assignment_list
				if (parts[0] !== undefined && parts[0].toLowerCase() == 'set') {
					parts.shift();
					insertStatement.valuesKVP = SQL.extractKVP(parts);
				}
				
				// Part = [AS row_alias[(col_alias [, col_alias] ...)]]
				if (parts[0] !== undefined && parts[0].toLowerCase() == 'as') {
					parts.shift();
					parts.shift();
					const firstAlias = parts.shift() || '';
					const firstAliasName = (firstAlias.substring(1, firstAlias.length) || '').replace(/`|'/g, '');
					insertStatement.rowAliases = SQL.extractValuesList(parts, firstAliasName, true);
				}
				
				// Part = { SELECT ... | TABLE table_name | VALUES row_constructor_list }
				if (parts[0] !== undefined && parts[0].toLowerCase() == 'select') {
					let onIndex = -1;
					
					for (const part of parts) {
						if (part.toLowerCase() == 'on') { onIndex = parts.indexOf(part); break; }
					}
					
					if (onIndex == -1) {
						insertStatement.selectStatement = parts.join(' ');
					} else {
						insertStatement.selectStatement = parts.slice(0, onIndex).join(' ');
					}
				}
				
				// Part = [ON DUPLICATE KEY UPDATE assignment_list]
				if (parts[0] !== undefined && parts[0].toLowerCase() == 'on') {
					parts.shift();
					parts.shift();
					parts.shift();
					parts.shift();
					
					insertStatement.onDuplicateKeyUpdate = SQL.extractKVP(parts);
				}
			}
		}
		
		return insertStatement;
	}
		
	//#endregion
	
	//#region UPDATE
	
	private static async processUpdate(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		
	}
	
	//#endregion
	
	//#region DELETE
	
	private static async processDelete(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		
	}
	
	//#endregion
	
	//#region CREATE
	
	private static async processCreate(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		/*
			The following tests will be done for the CREATE command:
				- Check if the table exists
					- If it does, log that the table already exists
					- If not, create the table
		*/
		
		Log.info(`Processing CREATE command: ${sql}`, sqlStatementIndex, sqlStatementTotal);
		
		const createWhat = parts[1].toLowerCase();
		const tableName = parts[2].replace(/`/g, '');
		const query = `SHOW TABLES LIKE '${tableName}'`;
		const [results] = await connection.query(query);
		
		if (Array.isArray(results) && results.length > 0) {
			if (createWhat == 'table') { Log.info(`Table already exists: ${tableName}`, sqlStatementIndex, sqlStatementTotal); }
			else if (createWhat == 'view') { Log.info(`View already exists: ${tableName}`, sqlStatementIndex, sqlStatementTotal); }
		} else {
			if (createWhat == 'table') { Log.info(`Creating table: ${tableName}`, sqlStatementIndex, sqlStatementTotal); }
			else if (createWhat == 'view') { Log.info(`Creating view: ${tableName}`, sqlStatementIndex, sqlStatementTotal); }
			try { await connection.query(sql); } catch (error: any) { Log.error(`Error creating table: ${error.message}`, sqlStatementIndex, sqlStatementTotal); }
		}
	}
	
	//#endregion
	
	//#region DROP
	
	private static async processDrop(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		/*
			The following tests will be done for the DROP command:
				- Check if the table exists
					- If it does, drop the table
					- If not, log that the table does not exist
		*/
		
		Log.info(`Processing DROP command: ${sql}`, sqlStatementIndex, sqlStatementTotal);
		
		const tableName = parts[2].replace(/`/g, '');
		const query = `SHOW TABLES LIKE '${tableName}'`;
		const [results] = await connection.query(query);
		
		if (Array.isArray(results) && results.length > 0) {
			Log.info(`Table exists: ${tableName}... Dropping`, sqlStatementIndex, sqlStatementTotal);
			try { await connection.query(sql); } catch (error: any) { Log.error(`Error dropping table: ${error.message}`, sqlStatementIndex, sqlStatementTotal); }
		} else { Log.info(`Table does not exist: ${tableName}`, sqlStatementIndex, sqlStatementTotal); }
	}
	
	//#endregion
	
	//#region ALTER
	
	private static async processAlter(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		
	}
	
	//#endregion
	
	//#region TRUNCATE
	
	private static async processTruncate(sql: string, connection: mysql.Connection, sqlStatementIndex: number, sqlStatementTotal: number, parts: string[]) {
		/*
			The following tests will be done for the TRUNCATE command:
				- Check if the table exists
					- If it does, truncate the table
					- If not, log that the table does not exist
		*/
		
		Log.info(`Processing TRUNCATE command: ${sql}`, sqlStatementIndex, sqlStatementTotal);
		
		const tableName = parts[1].replace(/`/g, '');
		const query = `SHOW TABLES LIKE '${tableName}'`;
		const [results] = await connection.query(query);
		
		if (Array.isArray(results) && results.length > 0) {
			Log.info(`Table exists: ${tableName}... Truncating`, sqlStatementIndex, sqlStatementTotal);
			try { await connection.query(sql); } catch (error: any) { Log.error(`Error truncating table: ${error.message}`, sqlStatementIndex, sqlStatementTotal); }
		} else { Log.info(`Table does not exist: ${tableName}`, sqlStatementIndex, sqlStatementTotal); }
	}
	
	//#endregion
}
