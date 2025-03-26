export interface IRound {
  position: 'right' | 'left';
  content?: string;
  thinkPlaceholder?: string;
  load?: () => Promise<IRes>;
  loadImgs?: () => Promise<IRes>;
  platform?: string;
}

export interface IRes {
  wording: string;
  imgs: string[];
  thinking?: string;
}
