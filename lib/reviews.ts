export function reviewRoundForNumber<T extends { roundNumber: number }>(
  rounds: readonly T[],
  roundNumber: number,
): T | undefined {
  return rounds.find((round) => round.roundNumber === roundNumber);
}
