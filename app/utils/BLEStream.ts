let bluetooth = require('nativescript-bluetooth');


export default class BLEStream {

	private _data: ArrayBuffer;
	private dataPointer: number = 0;
	private writeData: string = '';
	private	transmitting: boolean = false;
	private options: object;
	private chunkSize: number = 100;

	async receiver(result: any, options: object): Promise<void> {
		console.log("BLEStream: Receiving data");
		this.options = options;
		if(this.transmitting) await this.retrieveData(result);
		else await this.retrieveSize(result);
	}

	async writer(value: object, options: object): Promise<void> {
		console.log("BLEStream: Sending Data");
		this.options = options;
		this.writeData = JSON.stringify(value);

		if(this.transmitting) this.sendData();
		else this.sendSize();
	}

	async retrieveData(result: any): Promise<void> {
		let transmission: object = this.data2object(result.value)
		let msg: string = transmission['msg'];
		console.log(`MSG: ${msg}`);
		if(msg != "DATA") {
			// Error: Peripheral and central are out of sync
			return;
		}
		let datastr: string = transmission['payload'];
		let data: ArrayBuffer = this.str2data(datastr);
		this.appendData(data);
		let remainingBytes: number = this._data.byteLength - this.dataPointer;
		console.log(`BLEStream: Remaining Bytes: ${remainingBytes}`);
		if(remainingBytes > 0) {
			await this.read()
			console.log("DataFunc: Done Reading");
			return;
		}
		this.transmitting = false;
		this.dataPointer = 0;
	}

	async sendData(): Promise<void> {
		let remainingBytes: number = this.writeData.length - this.dataPointer;
		let dataSize: number = remainingBytes > this.chunkSize ? this.chunkSize : remainingBytes;
		let curChunk: string = this.writeData.substr(this.dataPointer, dataSize);

		console.log(`Sending Chunk: ${curChunk}`);
		this.dataPointer += dataSize;
		let transmission: object = {
			'msg': 'DATA',
			'payload': curChunk
		};
		remainingBytes = this.writeData.length - this.dataPointer;

		await this.write(transmission);

		if(remainingBytes > 0) {
			await this.writer(JSON.parse(this.writeData), this.options);
			return;
		}
		this.transmitting = false;
	}

	async retrieveSize(result: any): Promise<void> {
		this.transmitting = true;
		this.dataPointer = 0;
		let transmission: object = this.data2object(result.value);
		let msg: string = transmission['msg'];
		console.log(`MSG: ${msg}`);
		if(msg != "SIZE") {
			// Error: The peripheral and central devices are out of sync
			// TODO: Consider restarting transmission
			return;
		}
		let size: number = transmission['payload'];
		this._data = new ArrayBuffer(size)
		console.log(`Obtained data size: ${size}`);
		await this.read();
		console.log("SizeFunc: Done Reading");
	}

	async sendSize(): Promise<void> {
		this.transmitting = true;
		this.dataPointer = 0;
		let data_size: number = this.writeData.length;

		console.log(`Sending data to write: ${data_size}`);
		let transmission: object = {
			'msg': 'SIZE',
			'payload': data_size
		};
		this.write(transmission);
		await this.writer(JSON.parse(this.writeData), this.options);
	}

	appendData(data: ArrayBuffer): void {
		let dataView: Uint8Array = new Uint8Array(this._data);
		let curDataView: Uint8Array = new Uint8Array(data);
		curDataView.forEach((e, i) => {dataView[this.dataPointer+i] = e;});
		this.dataPointer += data.byteLength;

		console.log(`New Data obtained: ${String.fromCharCode.apply(null, new Uint8Array(data))}`);
		console.log(`Current Data: ${String.fromCharCode.apply(null, new Uint8Array(this._data))}`);
	}

	async read(): Promise<void> {
		let rd: Promise<any> = new Promise(resolve => {
			bluetooth.read(this.options).then((result) => {
				resolve(result);
			}, (err) => {
				console.error(`ERROR: ${err}`);
			});
		});
		let next_read_result: any = await rd;
		await this.receiver(next_read_result, this.options);
	}

	async write(value: any): Promise<void> {
		this.options['value'] = this.value2hex(value);
		let wrt: Promise<any> = new Promise(resolve => {
			bluetooth.write(this.options).then(()=>{
				resolve();
			}, (err)=>{
				console.error(`BLE Write Error: ${err}`)
			});
		});
		await wrt;
	}

	get data(): object {
		let data_str: string = String.fromCharCode.apply(null, new Uint8Array(this._data));
		let data_obj: object = JSON.parse(data_str);
		return data_obj;
	}

	value2hex(value: any): string[] {
		let jsonString: string = JSON.stringify(value);
		return this.str2hex(jsonString);
	}

	str2hex(str: string): string[] {
		let arrayBuffer: ArrayBuffer = new ArrayBuffer(str.length);
		let bufferView: Uint8Array = new Uint8Array(arrayBuffer);
		str.split('').forEach((e,i) => bufferView[i]=str.charCodeAt(i));
		let result: string[] = Array.prototype.map.call(new Uint8Array(arrayBuffer), x => ('0x'+x.toString(16)).slice(-4)).join(',');
		return result;

	}

	data2object(data: ArrayBuffer): object {
		let strData: string = String.fromCharCode.apply(null, new Uint8Array(data));
		return JSON.parse(strData);
	}

	str2data(datastr: string): ArrayBuffer {
		let result: ArrayBuffer = new ArrayBuffer(datastr.length);
		let bufView: Uint8Array = new Uint8Array(result);
		datastr.split('').forEach((e,i)=>{bufView[i]=datastr.charCodeAt(i);});
		return result;
	}
}