import type { LogStructure } from "./interfaces";

export default abstract class Log {
	private static messages: LogStructure[] = [];
	
	public static info(message: string, index: number, length: number, payload: any | null = null) {
		Log.messages.push({ type: 'info', message, payload, progress: `${index} of ${length}` });
	}
	
	public static error(message: string, index: number, length: number, payload: any | null = null) {
		Log.messages.push({ type: 'error', message, payload, progress: `${index} of ${length}` });
	}
	
	public static print() {
		for (const log of Log.messages) {
			console.log('='.repeat(80));
			
			if (log.type === 'info') {
				console.info(`[INFO][${log.progress}] ${log.message}`);
			} else {
				console.error(`[ERROR][${log.progress}] ${log.message}`);
			}
			
			if (log.payload) { console.log(`[PAYLOAD]`, log.payload); }
		}
	}
}
