import { isNil } from 'lodash-es';
import { observable, computed, action, flow, makeAutoObservable } from 'mobx';
import { EPlayerType, getRandomCardsSortFrom52, TCard } from './help';
import { Player } from './player';

export class Game {
  allCards = getRandomCardsSortFrom52();
  cardIndex = 0;
  currentRound = 0;
  commonCards: TCard[];
  getCards(count: number) {
    const cards: TCard[] = [];
    let i = this.cardIndex;
    while (i < this.cardIndex + count) {
      cards.push(this.allCards[i]);
      i++;
    }
    this.cardIndex = i;
    return cards;
  }
  players: Array<Player> = [];
  dealerIndex = 0;
  getDealer() {
    return this.players[this.dealerIndex];
  }
  constructor() {
    makeAutoObservable(this);
    this.commonCards = this.getCards(5);
    this.players = [
      this.createBot(2),
      this.createBot(3),
      new Player(1, this.getCards(2), EPlayerType.Man, `Joey`),
      this.createBot(4),
      this.createBot(5),
      this.createBot(6),
      this.createBot(7),
    ];
  }
  startRound() {
    setInterval(() => {
      this.players.forEach((player) => {
        player.action();
      });
    }, 1000);
  }
  getRound() {
    if (isNil(this.players[0].ante)) {
      return '翻牌前';
    }
    return;
  }
  createBot(uid: number) {
    return new Player(uid, this.getCards(2), EPlayerType.Bot, `Bot${uid}`);
  }
}
