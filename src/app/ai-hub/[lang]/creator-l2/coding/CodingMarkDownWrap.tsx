import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { UploadFile } from 'antd';
import { message, Spin, Tooltip } from 'antd';
import { LoadingOutlined, DownloadOutlined, CaretRightOutlined } from '@ant-design/icons';
import { IDict } from '../dictionaries';
import { ICodingRes, IRound } from '../help';
import styles from '../index.module.scss';


export const CodingMarkDownWrap: React.FC<{
    onMultiPlatSubmit: () => void;
    onMyStyle: () => void;
    platforms: string[];
    onPlatformsChange: (value: string[]) => void;
    round: IRound;
    fileList?: UploadFile[] | null;
    setFileList: (files: UploadFile[] | null) => void;
    dict: IDict;
  }> = (props) => {
    const [data, setData] = useState<ICodingRes>();
    const {
      dict,
      round,
      round: { thinkPlaceholder },
    } = props;
  
    useEffect(() => {
      if (round.load) {
        round
          .load()
          .then((res) => {
            if ('code' in res) {
              setData(res as ICodingRes);
              round.content = (res as ICodingRes).fulltext;
            } else {
              console.error('Invalid response type:', res);
              message.error(dict.words['Generation failed']);
            }
          })
          .catch((err) => {
            console.log(err);
            message.error(dict.words['Generation failed']);
          });
      } else {
        setData({
          code: 'Loading...',
          wording: 'Loading...',
          imgs: [],
        } as ICodingRes);
      }
    }, []);
  
    return (
      <>
        <div className={styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'}>
          <div className={styles.codingButtons}>
            {data && (
            <>
              <div
                className={styles.codingButton}
                onClick={() => {
                  if (data?.code) {
                    const newTab = window.open('', '_blank');
                    if (newTab) {
                      newTab.document.write(`
                              ${data.code}
                      `);
                      newTab.document.close();
                    } else {
                      message.error('Failed to open a new tab. Please check your browser settings.');
                    }
                  } else {
                    message.error('No code available to execute.');
                  }
                }}
              >
                <Tooltip title="Run code in new tab" color={'purple'}>
                  <CaretRightOutlined />
                </Tooltip>
              </div>
              <div
                className={styles.codingButton}
                onClick={() => {
                  if (data?.code && data?.language) {
                    const blob = new Blob([data.code], { type: 'text/plain' });
                    const fileName = `sample.${data.language}`; // Use data.language as the file name
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = fileName;
                    link.click();
                    URL.revokeObjectURL(link.href); // Clean up the object URL
                  } else {
                    message.error('No code or language available to download.');
                  }
                }}
              >
                <Tooltip title="Download code" color={'purple'}>
                  <DownloadOutlined />
                </Tooltip>
              </div>
            </>
          )}
          </div>
          {data ? (
            <div>
              <Markdown>{data.head}</Markdown>
              {data.code && <Markdown
                components={{
                  code({ className, children }) {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className}>
                        {children}
                      </code>
                    );
                  },
                }}
                >{`\`\`\`${data.language}\n${data.code}\n\`\`\``}</Markdown>}
              {/* {thinking ? (
                <StreamingMarkDown>{thinking + '\n' + data.wording}</StreamingMarkDown>
              ) : (
                <Markdown>{data.code}</Markdown>
              )} */}
              <Markdown>{data.tail}</Markdown>
            </div>
          ) : (
            <div>
              {thinkPlaceholder ?? dict.words['generating']}... <Spin indicator={<LoadingOutlined spin />} size="small" />
            </div>
          )}
        </div>
      </>
    );
  };
