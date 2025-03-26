export interface IRound {
  position: 'right' | 'left';
  content?: string;
  thinkPlaceholder?: string;
  load?: () => Promise<IRes>;
  loadImgs?: () => Promise<IRes>;
  header?: string;
}

export interface IRes {
  wording: string;
  imgs: string[];
  thinking?: string;
}
