// import { isNil } from 'lodash-es';
import { makeAutoObservable } from 'mobx';
import { EPlayerType, getRandomCardsSortFrom52, INotification, TCard } from './help';
import { Player } from './player';

export class Game {
  // 局数
  hand = 0;
  // 所有牌
  allCards = getRandomCardsSortFrom52();
  // 发到第几张牌
  cardIndex = 0;
  // 当前轮数
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
  get playersCount() {
    return this.players.length;
  }
  initDealerIndex = 0;
  get dealerIndex() {
    return this.initDealerIndex + this.hand;
  }
  get dealer() {
    return this.players[this.dealerIndex];
  }
  get smallBlindIndex() {
    return (this.dealerIndex + 1) % this.playersCount;
  }
  get smallBlind() {
    return this.players[this.smallBlindIndex];
  }
  get smallBlindUID() {
    return this.smallBlind.uid;
  }
  get bigBlindIndex() {
    return (this.dealerIndex + 2) % this.playersCount;
  }
  get bigBlind() {
    return this.players[this.bigBlindIndex];
  }
  get bigBlindUID() {
    return this.bigBlind.uid;
  }
  notify(params: INotification) {
    this.notification.push(params)
  }
  notification: Array<INotification> = []
  notificationIndex = 0;
  constructor() {
    makeAutoObservable(this);
    this.commonCards = this.getCards(5);
    this.players = [
      this.createBot(2),
      this.createBot(3),
      new Player(1, this.getCards(2), EPlayerType.Man, `Joey`, 7800, this),
      this.createBot(4),
      this.createBot(5),
      this.createBot(6),
      this.createBot(7),
    ];
    this.startRound();
  }
  async startRound() {
    const start = this.smallBlindIndex;
    const newPlayers = [...this.players];
    const beforePlayers = newPlayers.slice(0, start);
    const actionPlayers = newPlayers.slice(start).concat(beforePlayers);
    for (const player of actionPlayers) {
      console.log(player.name);
      await player.takeAction();
    }
  }
  getRound() {
    // if (isNil(this.players[0].ante)) {
    //   return '翻牌前';
    // }
    return;
  }
  createBot(uid: number) {
    return new Player(
      uid,
      this.getCards(2),
      EPlayerType.Bot,
      `Bot${uid}`,
      Math.floor(Math.random()) * 100 + 1000,
      this
    );
  }
}
