/* istanbul ignore file */
import { Readable } from 'stream';
import { BitstreamReader } from './bitstream';
import { performance } from 'perf_hooks';

export class FPSCounter {
    constructor(
        public label : string,
    ) {
    }

    reportingSecond : number = 0;
    fps : number = 0;
    private interval;
    private reportingFps : number = 0;
    private _reportFrequency : number = 10*1000;
    private _minf2f : number = Infinity;
    private _maxf2f : number = 0;
    private _avgf2f : number = 0;
    private _minft : number = Infinity;
    private _maxft : number = 0;
    private _avgft : number = 0;

    get reportFrequency() {
        return this._reportFrequency;
    }

    start(freq : number = 10*1000) {
        this._reportFrequency = freq;
        this.interval = setInterval(() => this.report(), this._reportFrequency);
        return this;
    }

    report() {
        let dec = (number : number, decimals : number = 2) => {
            let factor = Math.pow(10, decimals);
            return Math.floor(number * factor) / factor;
        };

        console.log(
            `${this.label}: ${this.fps}/s ` 
          + `| time: ${dec(this._avgft)}ms [${dec(this._minft)} - ${dec(this._maxft)}], ` 
          + `| f2f: ${dec(this._avgf2f)}ms [${dec(this._minf2f)} - ${dec(this._maxf2f)}]`
        );
        this._minft = Infinity;
        this._maxft = 0;
        this._minf2f = Infinity;
        this._maxf2f = 0;
    }

    stop() {
        clearInterval(this.interval);
    }

    private _presentationTime;

    present() {
        this._presentationTime = Date.now();
    }

    private _hitTime;
    
    hit() {
        if (this._presentationTime) {
            let ft = Date.now() - this._presentationTime;

            this._minft = Math.min(ft, this._minft);
            this._maxft = Math.max(ft, this._maxft);
            this._avgft = 0.99*this._avgft + 0.01*ft;
        }

        if (this._hitTime) {
            let f2f = Date.now() - this._hitTime
            this._minf2f = Math.min(f2f, this._minf2f);
            this._maxf2f = Math.max(f2f, this._maxf2f);
            this._avgf2f = 0.99*this._avgf2f + 0.01*f2f;
        }

        this._hitTime = Date.now();

        this.reportingFps += 1;
        if (Date.now() > (this.reportingSecond + 1) * 1000) {
            let now = Math.floor(Date.now() / 1000);
            this.fps = this.reportingFps;
            this.reportingSecond = now;
            this.reportingFps = 0;
            //console.log(`[!] ${this.label}: ${this.fps}/s`);
        }
    }
}

class Generator extends Readable {
    constructor() {
        super();
        setInterval(() => this.push(Buffer.alloc(10000000, 123)), 10);
    }

    _read(size : number) {
    }
}

function formatBytes(bytes: number) {
    if (bytes > 1024 * 1024 * 1024) {
        return `${Math.floor(bytes / 1024 / 1024 / 1024 * 100) / 100} GiB`;
    } else if (bytes > 1024 * 1024) {
        return `${Math.floor(bytes / 1024 / 1024 * 100) / 100} MiB`;
    } else if (bytes > 1024) {
        return `${Math.floor(bytes / 1024 * 100) / 100} KiB`;
    } else {
        return `${Math.floor(bytes * 100) / 100} B`;
    }
}

function syncTest() {
    let bitstream = new BitstreamReader();
    let iterations = 5;

    for (let i = 0; i < iterations; ++i) {
        let data = Buffer.alloc(1000 * 1024 * 1024, 123);
        bitstream.addBuffer(data);

        let read = 0;
        let max = data.length;
        console.log(`Iteration ${i + 1}: Reading ${formatBytes(data.length)}...`);

        let start = Date.now();
        for (; read < max; ++read) {
            let byte = bitstream.readSync(8);
        }

        let time = Date.now() - start;

        console.log(`    Read ${formatBytes(read)} over ${time / 1000} seconds (${formatBytes(read / (time / 1000))}/s)`);
    }
}

async function asyncTest() {
    let generator = new Generator();
    let bitstream = new BitstreamReader();
    let counter = new FPSCounter('hits');

    counter.start(5*1000);
    generator.on('data', data => {
        bitstream.addBuffer(data);
        console.log(`backlog: ${bitstream.available} bits now enqueued`);
    });

    setInterval(() => {
        console.log(`backlog: ${bitstream.available} bits not yet read`);
    }, 5*1000);

    while (true) {
        let byte = await bitstream.read(8);
        counter.hit();
    }
}

if (process.argv[2] === 'sync') {
    console.log(`sync test:`);
    syncTest();
} else {
    console.log(`async test:`);
    asyncTest();
}