import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';

export interface IRound {
  position: 'right' | 'left';
  content?: string;
  thinkPlaceholder?: string;
  load?: () => Promise<IRes> | Promise<ICodingRes>;
  query: string;
  platform?: string;
  showButtons?: boolean;
  shouldFetchImage?: boolean;
}

export interface IRes {
  wording: string;
  imgs: string[];
  thinking?: string;
  imgPrompt?: string;
}

export interface ICodingRes {
  language?: string;
  head?: string;
  code: string;
  tail?: string;
  fulltext?: string;
  thinking?: string;
  wording: string;
}

export const StreamingMarkDown: React.FC<{ children: string }> = (props) => {
  const [stream, setStream] = useState<string>(''); // Single state to manage the streamed content

  useEffect(() => {
    setStream('');
    const words = props.children.split(' '); // Split the text into words
    let currentIndex = 0; // Local variable to track the current word index

    const interval = setInterval(() => {
      if (currentIndex >= words.length - 1) {
        clearInterval(interval);
        return;
      }

      setStream((prevStream) => (prevStream ? `${prevStream} ${words[currentIndex]}` : words[currentIndex]));
      currentIndex++;
    }, 60); // Adjust the interval time as needed

    return () => clearInterval(interval);
  }, [props.children]);

  return <Markdown>{stream}</Markdown>;
};
