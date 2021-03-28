import { BitstreamElement } from './element';
import { Field } from './field';
import { BitstreamReader } from './reader';
import { Variant } from './variant';

const OP_PRINT = 0x3A;

export class Command extends BitstreamElement {
    @Field(8) opcode : number;
}

@Variant<Command>(i => i.opcode === OP_PRINT)
export class PrintCommand extends Command {
    @Field() message : string;
}

async function sample() {
    let aReader : BitstreamReader;
    let command = await Command.read(aReader);
}

