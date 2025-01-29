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

export enum ECardType {
  'Clubs' = 'clubs',
  'Diamonds' = 'diamonds',
  'Hearts' = 'hearts',
  'Spades' = 'spades',
}

export const initGame = {
  currentRound: 0,
  commonCards: [
    [ECardNum.A, ECardType.Diamonds],
    [ECardNum.K, ECardType.Spades],
    [ECardNum.Q, ECardType.Hearts],
    [ECardNum.J, ECardType.Clubs],
    [ECardNum.Ten, ECardType.Hearts],
  ],
  players: [
    {
      uid: '1',
      cards: [
        [ECardNum.Seven, ECardType.Spades],
        [ECardNum.Four, ECardType.Clubs],
      ],
    },
    {
      uid: '2',
      cards: [
        [ECardNum.K, ECardType.Diamonds],
        [ECardNum.Four, ECardType.Spades],
      ],
    },
    {
      uid: '3',
      cards: [
        [ECardNum.K, ECardType.Diamonds],
        [ECardNum.Four, ECardType.Spades],
      ],
    },
    {
      uid: '4',
      cards: [
        [ECardNum.K, ECardType.Diamonds],
        [ECardNum.Four, ECardType.Spades],
      ],
    },
    {
      uid: '5',
      cards: [
        [ECardNum.K, ECardType.Diamonds],
        [ECardNum.Four, ECardType.Spades],
      ],
    },
    {
      uid: '6',
      cards: [
        [ECardNum.K, ECardType.Diamonds],
        [ECardNum.Four, ECardType.Spades],
      ],
    },
  ],
  records: [
    {
      round: 0,
      roundName: '发牌',
    },
  ],
};
