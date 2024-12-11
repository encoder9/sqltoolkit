import { parseArgs } from "util";
import { DatabaseType, type DatabaseCredentials } from "./interfaces";
import SQL from "./sql";
import Database from "./Database";

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
		help: { type: 'boolean' }
	},
	strict: true,
	allowPositionals: true,
});

if (values.help) {
	console.log(`Usage: node index.ts --sql <path> --dbName <name> --dbUsername <username> --dbPassword <password> --dbHost <host> --dbType <type> --dbPort <port>`);
	console.log(`Options:`);
	console.log(`  --sql <path>    Path to the SQL file to execute.`);
	console.log(`  --dbName <name>         Database name.`);
	console.log(`  --dbUsername <username> Database username. Will use dbName as dbUsername if not provided.`);
	console.log(`  --dbPassword <password> Database password. Will use dbName as dbPassword if not provided.`);
	console.log(`  --dbHost <host>         Database host (default: localhost).`);
	console.log(`  --dbType <type>         Database type (default: mysql). Supported types: mysql, postgres.`);
	console.log(`  --dbPort <port>         Database port (default: 3306).`);
	process.exit(0);
}

if (!values.sql) {
	console.error("SQL file path is required.");
	process.exit(1);
} else if (!values.dbName) {
	console.error("Database name is required.");
	process.exit(1);
} else if (!values.dbType) {
	console.error("Database type is required.");
	process.exit(1);
} else {
	const dbCredentials: DatabaseCredentials = {
		host: values.dbHost || 'localhost',
		port: parseInt(values.dbPort || '3306'),
		user: values.dbUsername || values.dbName,
		password: values.dbPassword || values.dbName,
		database: values.dbName,
		type: values.dbType == 'mysql' ? DatabaseType.MySQL : DatabaseType.Postgres
	};
	
	const sqlStatements = await SQL.getStatements(values.sql);
	
	if (sqlStatements) {
		await Database.executeSQL(dbCredentials, sqlStatements);
	}
}
