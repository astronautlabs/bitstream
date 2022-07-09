export interface IncompleteReadResult {
    remaining: number;
    contextHint?: () => string;
}