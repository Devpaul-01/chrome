export function shufflePick(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

export function composeMessage(greetings: string[], bodies: string[], closings: string[]): string {
  if (!greetings.length || !bodies.length || !closings.length) {
    throw new Error('Each segment type must have at least one entry');
  }
  return `${shufflePick(greetings)} ${shufflePick(bodies)} ${shufflePick(closings)}`;
}

export function randomDelay(msMin = 5000, msMax = 15000): Promise<void> {
  const delay = Math.random() * (msMax - msMin) + msMin;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
