import { DatabaseType, type DatabaseCredentials, type DatabaseFileStructure } from "./interfaces";
import { parseArgs } from "util";
import { readFileSync } from "fs";
import Database from "./Database";
import SQL from "./sql";
import Log from "./log";
import SQLTokeniser from "./SQLTokeniser";

const { values, positionals } = parseArgs({
	args: Bun.argv,
	options: {
		sql: { type: 'string' },
		dbName: { type: 'string' },
		dbUsername: { type: 'string' },
		dbPassword: { type: 'string' },
		dbHost: { type: 'string', default: 'localhost' },
		dbType: { type: 'string', default: 'mysql' },
		dbPort: { type: 'string', default: '3306' },
		databases: { type: 'string' },
		help: { type: 'boolean' },
		databaseExample: { type: 'boolean' }
	},
	strict: true,
	allowPositionals: true,
});

if (values.help) {
	console.log(`Usage: node index.ts --sql <path> --dbName <name> --dbUsername <username> --dbPassword <password> --dbHost <host> --dbType <type> --dbPort <port>`);
	console.log(`Options:`);
	console.log(`  --sql <path>            Path to the SQL file to execute.`);
	console.log(`  --dbName <name>         Database name.`);
	console.log(`  --dbUsername <username> Database username. Will use dbName as dbUsername if not provided.`);
	console.log(`  --dbPassword <password> Database password. Will use dbName as dbPassword if not provided.`);
	console.log(`  --dbHost <host>         Database host (default: localhost).`);
	console.log(`  --dbType <type>         Database type (default: mysql). Supported types: mysql, postgres.`);
	console.log(`  --dbPort <port>         Database port (default: 3306).`);
	console.log(`  --databases <path>      List of databases to execute SQL on. Call --databaseExample to output a sample file.`);
	console.log(`  --databaseExample       Output a sample databases JSON file.`);
	process.exit(0);
} else if (values.databaseExample) {
	console.log(JSON.stringify({
		"databases": [{
			"host": "localhost",
			"port": 3306,
			"user": "database1",
			"database": "database1",
			"password": "database1",
			"type": "mysql"
		}, {
			"host": "localhost",
			"port": 3306,
			"user": "database2",
			"database": "database2",
			"password": "database2",
			"type": "mysql"
		}]
	}, null, 4));
	
	process.exit(0);
}

if (!values.sql) {
	console.error("SQL file path is required.");
	process.exit(1);
} else if (!values.dbName && !values.databases) {
	console.error("Database name or a path to a JSON database file is required.");
	process.exit(1);
} else if (!values.dbType) {
	console.error("Database type is required.");
	process.exit(1);
} else {
	let dbCredentials: DatabaseCredentials[] = [];
	
	if (values.databases) {
		try {
			const fileContent = readFileSync(values.databases, "utf-8");
			const parsedData: DatabaseFileStructure = JSON.parse(fileContent);
			
			if (Array.isArray(parsedData.databases)) {
				dbCredentials = parsedData.databases.map(db => ({
					host: db.host,
					port: db.port,
					user: db.user,
					password: db.password,
					database: db.database,
					type: values.dbType === 'mysql' ? DatabaseType.MySQL : DatabaseType.Postgres
				}));
			} else {
				console.error("Invalid format in databases JSON file.");
				process.exit(1);
			}
		} catch (error: any) {
			console.error("Error reading or parsing the databases JSON file:", error.message);
			process.exit(1);
		}
	} else {
		dbCredentials.push({
			host: values.dbHost || 'localhost',
			port: parseInt(values.dbPort || '3306'),
			user: values.dbUsername || values.dbName || '',
			password: values.dbPassword || values.dbName || '',
			database: values.dbName || '',
			type: values.dbType === 'mysql' ? DatabaseType.MySQL : DatabaseType.Postgres
		});
	}
	
	const sqlStatements = await SQL.getStatements(values.sql);
	
	if (sqlStatements) {
		console.log(SQLTokeniser.parseStatements(sqlStatements));
		// await Database.executeSQL(dbCredentials, sqlStatements);
		Log.print();
		process.exit(0);
	} else {
		console.log("No SQL statements found.");
		process.exit(1);
	}
}
