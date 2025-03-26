export interface IRound {
  position: 'right' | 'left';
  content?: string;
  load?: () => Promise<IRes>;
}

export interface IRes {
  wording: string;
  imgs: string[];
}
