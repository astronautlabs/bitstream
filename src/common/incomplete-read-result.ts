export interface IncompleteReadResult {
    remaining: number;
    optional?: boolean;
    contextHint?: () => string;
}