import { countReset } from 'console';
import { Readable } from 'stream';
import { BitstreamReader } from './bitstream';
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
        setInterval(() => this.push(Buffer.alloc(10000, 123)), 10);
    }

    _read(size : number) {
    }
}

function syncTest() {
    let generator = new Generator();
    let bitstream = new BitstreamReader();
    let counter = new FPSCounter('hits');

    counter.start(5*1000);
    generator.on('data', data => {
        bitstream.addBuffer(data);
        for (let i = 0; i < data.length; ++i) {
            let byte = bitstream.readSync(8);
            counter.hit();
        }
    });
}

async function asyncTest() {
    let generator = new Generator();
    let bitstream = new BitstreamReader();
    let counter = new FPSCounter('hits');

    counter.start(5*1000);
    generator.on('data', data => bitstream.addBuffer(data));

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