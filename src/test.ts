import "zone.js";
import "reflect-metadata";
import "source-map-support/register";
import "ts-node/register";
import { suite } from "razmin";

suite()
    .include(['**/*.test.js'])
    .run()
;