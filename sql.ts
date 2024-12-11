import { readFileSync } from 'fs';

export default abstract class SQL {
	public static async getStatements(filePath: string) {
		const statements = await SQL.readSQLFile(filePath);
		return SQL.validateSQL(statements) ? statements : null;
	}
	
	private static async readSQLFile(filePath: string): Promise<string[]> {
		let fileContents = '';
		
		try {
			fileContents = readFileSync(filePath, 'utf-8');
		} catch (error: any) {
			console.error(`Error reading file: ${error.message}`);
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
				!statement.toLowerCase().startsWith('/*') &&
				!statement.toLowerCase().startsWith('truncate')
			) {
				console.error(`Potentially invalid SQL statement: ${statement}`);
				process.exit(1);
			}
		}
		
		return true;
	}
}
