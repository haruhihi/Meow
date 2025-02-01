import { makeAutoObservable } from 'mobx';
import { EPlayerType, TCard } from './help';

export class Player {
  uid: number;
  cards: TCard[];
  type: EPlayerType;
  name: string;
  ante?: number;
  constructor(uid: number, cards: TCard[], type: EPlayerType, name: string) {
    makeAutoObservable(this);
    this.uid = uid;
    this.cards = cards;
    this.type = type;
    this.name = name;
  }
  action() {
    console.log('action');
  }
}
