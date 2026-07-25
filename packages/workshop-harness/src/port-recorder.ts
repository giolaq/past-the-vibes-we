import { existsSync, readFileSync, writeFileSync } from "node:fs";

export type RecordedTurn = {
  timestamp: string;
  phase: string;
  request: { model: string; system: string; messages: unknown[] };
  response: unknown;
  usage: { input_tokens: number; output_tokens: number };
  costUsd?: number;
};

export class PortRecorder {
  private turns: RecordedTurn[] = [];
  constructor(private path: string) {}
  record(turn: RecordedTurn): void {
    this.turns.push(turn);
    writeFileSync(this.path, JSON.stringify(this.turns, null, 2));
  }
}

export class PortReplay {
  private index = 0;
  private turns: RecordedTurn[];
  constructor(path: string) { this.turns = JSON.parse(readFileSync(path, "utf8")) as RecordedTurn[]; }
  next(phase: string): RecordedTurn {
    // A recording holds a whole run. A partial run (`--phases`) or a resumed one consumes only
    // its own phases, so skip forward past turns belonging to phases this run is not executing.
    // Turns within a phase keep their order, which is what makes a recorded retry replay.
    while (this.index < this.turns.length && this.turns[this.index].phase !== phase) this.index++;
    const turn = this.turns[this.index++];
    if (!turn) throw new Error(`Replay has no turn left for ${phase}`);
    return turn;
  }
  static exists(path?: string): path is string { return Boolean(path && existsSync(path)); }
}
