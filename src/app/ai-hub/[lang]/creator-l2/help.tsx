import { useEffect, useState } from 'react';
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
  const [stream, setStream] = useState<string>(''); // Single state to manage the streamed content

  useEffect(() => {
    setStream('');
    console.log('clean stream', props.children);
    const words = props.children.split(' '); // Split the text into words
    let currentIndex = 0; // Local variable to track the current word index

    const interval = setInterval(() => {
      if (currentIndex >= words.length) {
        clearInterval(interval);
        return;
      }
      setStream((prevStream) => (prevStream ? `${prevStream} ${words[currentIndex]}` : words[currentIndex]));
      currentIndex++;
    }, 100); // Adjust the interval time as needed

    return () => clearInterval(interval);
  }, [props.children]);

  return <Markdown>{stream}</Markdown>;
};
