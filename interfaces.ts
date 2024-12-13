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

export interface DatabaseFileStructure {
	databases: DatabaseCredentials[];
}

export interface LogStructure {
	type: 'info' | 'error';
	message: string;
	payload: any | null;
	progress: string;
}

export interface InsertStatement extends Statement {
	partitionNames: string[];
	rowAliases: string[];
	onDuplicateKeyUpdate: KVP[];
	selectStatement: string;
}

export interface Statement {
	tableName: string;
	columnNames: string[];
	values: SQLDataType[];	// Review - Why can't I make this SQLDataType[] | KVP[] instead?
	valuesKVP: KVP[];
}

export type SQLDataType = string | number | boolean | null;

export interface KVP {
	[key: string]: SQLDataType;
}

export interface Table {
	name: string;
	columns: Column[];
	rowCount: number;
}

export interface Column {
	name: string;
	ordinal: number;
	default: string | null;
	nullable: boolean;
	type: string;
	length: number;
	precision: number;
	columnType: string;
	key: '' | 'PRI' | 'UNI' | 'MUL';
	extra: string;
}
