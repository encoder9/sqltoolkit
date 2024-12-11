import { Client as PgClient } from "pg"; // PostgreSQL client for SQL execution
import mysql from "mysql2/promise"; // MySQL client for SQL execution
import { DatabaseType, type DatabaseCredentials } from "./interfaces";

export default abstract class Database {
	public static async executeSQL(dbCredentials: DatabaseCredentials, sqlStatements: string[]) {
		if (dbCredentials.type === DatabaseType.Postgres) { await this.executePostgresSQL(dbCredentials, sqlStatements); }
		else if (dbCredentials.type === DatabaseType.MySQL) { await this.executeMySQL(dbCredentials, sqlStatements); }
		else {
			console.error("Unsupported database type.");
			process.exit(1);
		}
	}
	
	private static async executePostgresSQL(dbCredentials: DatabaseCredentials, sqlStatements: string[]) {
		// const client = new PgClient(dbCredentials);
		
		// try {
		// 	// Connect to the database
		// 	await client.connect();
	
		// 	// Read and validate SQL file
		// 	const sqlStatements = await readSQLFile(filePath);
		// 	await validateSQL(sqlStatements);
	
		// 	// Loop through and execute SQL commands
		// 	for (const statement of sqlStatements) {
		// 	const query = "SELECT COUNT(*) as count FROM executed_commands WHERE command = $1";
	
		// 	// Check if the command has already been executed
		// 	const { rows } = await client.query(query, [statement]);
		// 	if (rows[0].count > 0) {
		// 		console.log(`Already run this command: ${statement}`);
		// 		continue;
		// 	}
	
		// 	// Execute the command if it hasn't been run
		// 	try {
		// 		const result = await client.query(statement);
	
		// 		// Log the executed command
		// 		console.log(`Executed this command: ${statement}`);
		// 		console.log(`Result:`, result.rows);
	
		// 		// Record the executed command
		// 		await client.query("INSERT INTO executed_commands (command) VALUES ($1)", [statement]);
		// 	} catch (executionError) {
		// 		console.error(`Error executing command: ${executionError.message}`);
		// 	}
		// 	}
		// } catch (connectionError) {
		// 	console.error(`Error connecting to the database: ${connectionError.message}`);
		// } finally {
		// 	await client.end();
		// }
	}
	
	private static async executeMySQL(dbCredentials: DatabaseCredentials, sqlStatements: string[]) {
		const connection = await mysql.createConnection({
			host: dbCredentials.host,
			port: dbCredentials.port,
			user: dbCredentials.user,
			password: dbCredentials.password,
			database: dbCredentials.database,
		});
		
		console.log(connection);
		
		
		try {
			// Loop through and execute SQL commands
			for (const statement of sqlStatements) {
				// console.log(statement);
				
				// Execute the command if it hasn't been run
				// try {
					
				// } catch (executionError) {
				// 	console.error(`Error executing command: ${executionError.message}`);
				// }
			}
		} catch (connectionError: any) {
			console.error(`Error connecting to the database: ${connectionError.message}`);
		} finally {
			await connection.end();
		}
	}
}
