import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';

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

export const StreamingMarkDown: React.FC<{ children: string }> = (props) => {
  const [stream, setStream] = useState<string>('');
  const ref = useRef<number>(0);

  console.log('props.children', props.children);

  useEffect(() => {
    const interval = setInterval(() => {
      if (ref.current > props.children.length - 1) {
        clearInterval(interval);
        return;
      }
      setStream((stream) => stream + props.children.charAt(ref.current));
      ref.current++;
    }, 50);

    return () => clearInterval(interval);
  }, [props.children]);

  return <Markdown>{stream}</Markdown>;
};
