/* istanbul ignore file */
import "zone.js";
import "reflect-metadata";
import "source-map-support/register";
import "ts-node/register";
import { suite } from "razmin";

globalThis.BITSTREAM_TRACE = false;

suite()
    .include(['**/*.test.js'])
    .run()
;