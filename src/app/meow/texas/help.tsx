import { Game } from './game';

export type TCard = [ECardNum, ECardType];

export enum ECardNum {
  A = 'ace',
  K = 'king',
  Q = 'queen',
  J = 'jack',
  'Ten' = '10',
  'Nine' = '9',
  'Eight' = '8',
  'Seven' = '7',
  'Six' = '6',
  'Five' = '5',
  'Four' = '4',
  'Three' = '3',
  'Two' = '2',
}

export const getRandomCardsSortFrom52 = () => {
  console.log(Object.values(ECardType), Object.values(ECardNum));
  const cards: TCard[] = [];
  for (const type of Object.values(ECardType)) {
    for (const num of Object.values(ECardNum)) {
      cards.push([num as ECardNum, type as ECardType]);
    }
  }

  const newCards: TCard[] = [];
  while (cards.length) {
    const index = Math.floor(Math.random() * cards.length);
    newCards.push(cards.splice(index, 1)[0]);
  }
  return newCards.slice(0, 19);
};

export enum ECardType {
  'Clubs' = 'clubs',
  'Diamonds' = 'diamonds',
  'Hearts' = 'hearts',
  'Spades' = 'spades',
}

export enum EPlayerType {
  Bot = 'bot',
  Man = 'man',
}

export enum EPlayerStatus {
  Normal,
  Pending,
  Finished
}

export const getPlayers = (game: Game, currentUID: number) => {
  const { players } = game;
  const allPlayers = [...players];
  const meIndex = players.findIndex((p) => p.uid === currentUID);
  const me = players[meIndex];
  let i = 0;
  // 0 1 2 3 4 5 6
  // 0 -> 3, 1 -> 2, 2 -> 1, 3 -> 0, 4 -> 6, 5 -> 5, 6 -> 4
  // (7 + 3 - i) % 7
  while (i < 7 + 3 - (meIndex % 7)) {
    const player = allPlayers.pop()!;
    allPlayers.unshift(player);
    i++;
  }
  return {
    me,
    otherPlayers: allPlayers.filter((p) => p.uid !== currentUID),
  };
};

export const getLabel = (player: Game['players'][0], players: Game['players'], game: Game) => {
  const dealerIndex = game.dealerIndex;

  const dealer = players[dealerIndex];
  const smallBlind = players[(dealerIndex + 1) % 7];
  const bigBlind = players[(dealerIndex + 2) % 7];

  if (player.uid === dealer.uid) {
    return '庄';
  }
  if (player.uid === smallBlind.uid) {
    return '小';
  }
  if (player.uid === bigBlind.uid) {
    return '大';
  }
  return null;
};

export const SMALL_BLIND_ANTE = 10;

export const BIG_BLIND_ANTE = 2 * SMALL_BLIND_ANTE;

export interface INotification {
  content: string;
}

export const delay = (time = 2000) => {
  return new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, time);
  });
}