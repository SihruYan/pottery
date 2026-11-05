export interface FortuneBubbles {
  tap1: string;
  tap2: string;
  dragFail: string;
  openTap: string;
  openDrag: string;
}

export interface PageCopy {
  eyebrow: string;
  title: string;
  hints: string[];
  openHint: string;
  bubbles: FortuneBubbles;
  again: string;
  copy: string;
  copied: string;
  copyFailed: string;
  emptyFortunes: string;
  todayCount: string;
  slipDate: string;
  seal: string;
  cookieLabel: string;
  muteOn: string;
  muteOff: string;
  loading: string;
}

export interface FortuneFile {
  page: PageCopy;
  fortunes: string[];
}
