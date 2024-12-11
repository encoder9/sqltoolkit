export interface DatabaseCredentials {
	host: string;
	port: number;
	user: string;
	password: string;
	database: string;
	type: DatabaseType;
}

export enum DatabaseType {
	Postgres = "postgres",
	MySQL = "mysql",
}
