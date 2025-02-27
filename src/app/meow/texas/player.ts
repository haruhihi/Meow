import { makeAutoObservable } from 'mobx';
import { BIG_BLIND_ANTE, delay, EPlayerStatus, EPlayerType, SMALL_BLIND_ANTE, TCard } from './help';
import { Game } from './game';

export class Player {
  uid: number;
  cards: TCard[];
  type: EPlayerType;
  name: string;
  status = EPlayerStatus.Normal;
  game: Game;
  chips: number;
  blindAnte?: number;
  constructor(uid: number, cards: TCard[], type: EPlayerType, name: string, chips: number, game: Game) {
    makeAutoObservable(this);
    this.uid = uid;
    this.cards = cards;
    this.type = type;
    this.name = name;
    this.game = game;
    this.chips = chips;
  }
  get isSmallBlind() {
    return this.uid === this.game.smallBlindUID;
  }
  get isBigBlind() {
    return this.uid === this.game.bigBlindUID;
  }

  async takeAction() {
    this.status = EPlayerStatus.Pending; 
    if (this.isSmallBlind) {
      await delay()
      this.blindAnte = SMALL_BLIND_ANTE;
      this.chips -= SMALL_BLIND_ANTE;
      this.status = EPlayerStatus.Finished;
      return
    }
    if (this.isBigBlind) {
      await delay();
      this.blindAnte = BIG_BLIND_ANTE;
      this.chips -= BIG_BLIND_ANTE;
      this.status = EPlayerStatus.Finished;
      return
    }
    await delay(5000);
    this.status = EPlayerStatus.Finished;
  }
}
