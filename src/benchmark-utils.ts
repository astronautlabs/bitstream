/* istanbul ignore file */
import { Readable } from "stream";

export async function runTest(test: Test): Promise<TestResult> {
    let iterations = test.iterations ?? 5;
    let results: number[] = [];

    console.log(`### ${test.name} ###`);
    for (let i = 0; i < iterations; ++i) {
        let value = await test.func();
        results.push(value);
        console.log(`    Iteration #${i + 1}: ${formatData(value, test.unit)}${test.suffix ?? ''}`);
    }

    let average = results.reduce((s, v) => s + v, 0) / iterations;
    return {
        test,
        results,
        average
    };
}

export interface Test {
    name: string,
    only?: boolean;
    func: () => number;
    unit: 'time' | 'bytes' | 'count';
    suffix?: string;
    iterations?: number;
}

export interface TestResult {
    test: Test;
    results: number[];
    average: number;
}

export async function runTests(tests: Test[]): Promise<TestResult[]> {
    let results: TestResult[] = [];
    let only = tests.some(x => x.only);

    for (let test of tests) {
        if (!only || test.only)
            results.push(await runTest(test));
    }

    console.log();
    console.log(`### RESULTS ###`);
    for (let result of results) {
        console.log(`${result.test.name}: ${formatData(result.average, result.test.unit)}${result.test.suffix ?? ''}`);
    }

    return results;
}

export function formatBytes(bytes: number) {
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

export function formatTime(time: number) {
    if (time > 1000*60) {
        return `${Math.floor(time / 1000 / 60 * 100) / 100}m`;
    } else if (time > 1000) {
        return `${Math.floor(time / 1000 * 100) / 100}s`;
    } else {
        return `${Math.floor(time * 100) / 100}ms`;
    }
}

export function formatCount(count: number) {
    if (count > 1000 * 1000 * 1000) {
        return `${Math.floor(count / 1000 / 1000 / 1000 * 100) / 100}G`;
    } else if (count > 1000 * 1000) {
        return `${Math.floor(count / 1000 / 1000 * 100) / 100}M`;
    } else if (count > 1000) {
        return `${Math.floor(count / 1000 * 100) / 100}K`;
    } else {
        return `${Math.floor(count * 100) / 100}`;
    }
}

export function formatData(value: number, units: 'time' | 'bytes' | 'count') {
    if (units === 'time')
        return formatTime(value);
    else if (units === 'bytes')
        return formatBytes(value);
    else
        return formatCount(value);
}

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

export class Generator extends Readable {
    constructor(size = 10_000_000, interval = 10) {
        super();
        setInterval(() => this.push(Buffer.alloc(size, 123)), interval);
    }

    _read(size : number) {
    }
}
