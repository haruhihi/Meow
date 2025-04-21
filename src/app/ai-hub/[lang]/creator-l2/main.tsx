'use client';
import { useState, useEffect, useRef } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Button, message, Spin, Tooltip } from 'antd';
import { ArrowUpOutlined, LoadingOutlined, CloseCircleOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';
import type { UploadFile } from 'antd';
import classNames from 'classnames';
import { getTypeConfigs } from './type-config';
import PictureWall from './picture-wall';
import { MultiPlatformButton } from './multi-platform-button';
import { isUrlEnable } from '@utils/tool';
import { IRes, IRound, StreamingMarkDown, ICodingRes } from './help';
import pako from 'pako';
import { IDict } from './dictionaries';
import { templateMap, placeholderMap } from './constants';

import mockData from '../../../../static/mock/coding.json'; // Import the mock JSON file
import { CodingMarkDownWrap } from './coding/CodingMarkDownWrap';

const isDev = isUrlEnable('dev');

export const Main: React.FC<{ dict: IDict }> = ({ dict }) => {
  // const [isShowItems, setIsShowItems] = useState(false);
  const [rounds, setRounds] = useState<IRound[]>([]);
  const [isShowTemplatePrompt, setIsShowTemplatePrompt] = useState(isDev ? true : false);
  const [texts, setTexts] = useState<string[]>(['', '', '', '']);
  const [fileList, setFileList] = useState<UploadFile[] | null>();
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [creatorType, setcreatorType] = useState('wording');
  const typeConfigs = getTypeConfigs(dict);
  const { words } = dict;

  const initialPrompt = templateMap[creatorType].map((item) => `${words[item]}`).join(', ');
  const [plainTextPrompt, setPlainTextPrompt] = useState<string>();
  const [query, setQuery] = useState<string>(initialPrompt);

  const pillsProps = {
    platforms,
    onPlatformsChange: (v: string[]) => setPlatforms(v),
    onMultiPlatSubmit: () => {
      setRounds([
        ...rounds,
        ...platforms.map((platform) => {
          return {
            query,
            position: 'left' as const,
            load: () => fetchContent('wording', { query: query, type: platform }),
            thinkPlaceholder: words['generating content for platform'].replace('${0}', platform),
            platform,
          };
        }),
      ]);
    },
    onMyStyle: () => {
      setRounds([
        ...rounds,
        {
          query,
          position: 'left' as const,
          load: () => fetchContent('wording', { query: query, type: dict.words['Personal style'] }),
          thinkPlaceholder: dict.words['Generating in your style'],
          platform: dict.words['Personal style'],
        },
      ]);
    },
  };

  const isEmptyPlainTextPrompt = plainTextPrompt === undefined || plainTextPrompt === '' || plainTextPrompt === '\n';

  const isShowSelection = isEmptyPlainTextPrompt && !isShowTemplatePrompt && rounds.length === 0;

  return (
    <div className={styles.wrap}>
      <aside className={styles.sideBarWrap}>
        <SideBar onClickItem={() => {}} typeConfigs={typeConfigs} dict={dict} />
      </aside>
      <div className={styles.mainWrap}>
        <main className={styles.main}>
          <div className={styles.chat}>
            <div className={styles.chatContent}>
              {rounds.map((round, index) => {
                if (round.position === 'right')
                  return (
                    <div key={index} className={styles.bubble}>
                      {round.query}
                    </div>
                  );
                return (
                  <div key={index}>
                    {creatorType !== 'coding' ? 
                    <MarkDownWrap
                      {...pillsProps}
                      round={round}
                      fileList={fileList}
                      setFileList={setFileList}
                      dict={dict}
                    ></MarkDownWrap> : 
                    <CodingMarkDownWrap
                      {...pillsProps}
                      round={round}
                      fileList={fileList}
                      setFileList={setFileList}
                      dict={dict}>
                    </CodingMarkDownWrap>
                    }
                  </div>
                );
              })}
            </div>

            <div className={styles.inputWrap}>
              {isShowTemplatePrompt ? (
                <div className={styles.inputContainer}>
                  <>
                    <div className={creatorType == 'coding' ? styles.codingInputWrapper : styles.templateInputWrapper}>
                    {templateMap[creatorType].map((item, index) => (
                      <div key={index}>
                        {dict.words[templateMap[creatorType][index]]}{' '}
                        <PromptInput
                          texts={texts}
                          setTexts={setTexts}
                          order={index}
                          placeholder={dict.words[placeholderMap[creatorType][index]] || ''}
                        />
                        {/* {index < templateMap[creatorType].length - 1 && ', '}. */}
                      </div>
                    ))}
                    </div>
                    <div
                      className={styles.clearButton}
                      onClick={() => {
                        setPlainTextPrompt('');
                        setIsShowTemplatePrompt(false);
                      }}
                    >
                      <Tooltip title="Clean prompt" color={'purple'}>
                        <CloseCircleOutlined />
                      </Tooltip>
                    </div>
                  </>
                </div>
              ) : (
                <PlainTextInput
                  plainTextPrompt={plainTextPrompt || ''}
                  setPlainTextPrompt={(fun) => setPlainTextPrompt((prev) => fun(prev ?? ''))}
                  placeholder={dict.words['Please enter your prompt']}
                />
              )}

              <div
                className={styles.send}
                onClick={() => {
                  const completeHistory = generateHistory(rounds);
                  if (isShowTemplatePrompt) {
                    const completeQuery = generateQuery(creatorType, texts, dict);
                    setRounds([
                      ...rounds,
                      { query: completeQuery, position: 'right', content: completeQuery },
                      {
                        query: completeQuery,
                        position: 'left',
                        shouldFetchImage: true,
                        load: () => {
                          if (creatorType === 'coding') {
                            return fetchCoding(creatorType, { prompt: completeQuery, history: completeHistory });
                          } else {
                            return fetchContent(creatorType, { query: completeQuery, type: texts[0] })
                          }
                        },
                      },
                    ]);
                    setPlainTextPrompt('');
                    setIsShowTemplatePrompt(false);
                    return;
                  }

                  if (!isEmptyPlainTextPrompt) {
                    setRounds([
                      ...rounds,
                      { query: plainTextPrompt, position: 'right', content: plainTextPrompt },
                      {
                        query: plainTextPrompt,
                        position: 'left',
                        load: () => {
                          if (creatorType === 'coding') {
                            return fetchCoding(creatorType, { prompt: plainTextPrompt, history: completeHistory });
                          } else {
                            return fetchContent(creatorType, { query: plainTextPrompt })
                          }
                        },
                        showButtons: false,
                      },
                    ]);
                    setPlainTextPrompt('');
                  }
                }}
              >
                <ArrowUpOutlined />
              </div>
            </div>

            <div
              className={styles.items}
              style={{ opacity: isShowSelection ? 1 : 0, pointerEvents: isShowSelection ? 'auto' : 'none' }}
            >
              {typeConfigs.map((item) => (
                <div 
                  key={item.key} 
                  className={styles.item}
                  onClick={() => {
                    setPlainTextPrompt('');
                    setIsShowTemplatePrompt(true);
                    const creatorType = item.key === 'Code' ? 'coding' : 'wording';
                    setcreatorType(creatorType);
                    const query =templateMap[creatorType].join(', ')
                    setQuery(query);
                  }}
                >
                  <div className={styles.icon}>{item.icon}</div>
                  <div className={styles.name}>{item.label}</div>
                  <div className={styles.extra}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

const MarkDownWrap: React.FC<{
  onMultiPlatSubmit: () => void;
  onMyStyle: () => void;
  platforms: string[];
  onPlatformsChange: (value: string[]) => void;
  round: IRound;
  fileList?: UploadFile[] | null;
  setFileList: (files: UploadFile[] | null) => void;
  dict: IDict;
}> = (props) => {
  const [data, setData] = useState<IRes>();
  const {
    dict,
    round,
    round: { thinkPlaceholder, platform, showButtons = true, shouldFetchImage = false },
    fileList,
    setFileList,
  } = props;

  useEffect(() => {
    if (round.load) {
      round
        .load()
        .then((res) => {
          if ('wording' in res && 'imgs' in res) {
            setData(res as IRes);
          } else {
            console.error('Invalid response type:', res);
            message.error(dict.words['Generation failed']);
          }
        })
        .catch((err) => {
          console.log(err);
          message.error(dict.words['Generation failed']);
        });
    }
  }, []);

  useEffect(() => {
    if (data === undefined) return;
    if (!data?.imgPrompt || !shouldFetchImage) {
      // setFileList(null);
      return;
    }
    // console.log('start fetch img');
    fetchContent('img', { query: data.imgPrompt })
      .then((res) => {
        setFileList(
          (res.imgs ?? []).map((url, index) => {
            const compressedData = Uint8Array.from(atob(url), (c) => c.charCodeAt(0));
            const decompressedData = pako.inflate(compressedData);
            const blob = new Blob([decompressedData], { type: 'image/jpeg' });
            const imageUrl = URL.createObjectURL(blob);

            return {
              uid: `${index}.jpg`,
              name: `${index}.jpg`,
              status: 'done',
              url: imageUrl,
            };
          })
        );
      })
      .catch((err) => {
        console.log(err);
        message.error(dict.words['Generation failed']);
      });
  }, [data]);

  const appendHeader = platform ? `## ${platform}\n` : '';
  const thinking = data?.thinking
    ? data.thinking
        .split('\n') // 按换行拆分每一行
        .map((line) => '> ' + line.trim()) // 每行前加上 >，并去掉首尾空白
        .join('\n')
    : '';
  const isPicAbove = platform?.toLowerCase() === 'facebook'.toLowerCase();

  return (
    <>
      <div className={styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'}>
        {data ? (
          <div>
            <Markdown>{appendHeader}</Markdown>
            {isPicAbove && fileList !== null && (
              <PictureWall fileList={fileList} setFileList={setFileList} dict={dict} />
            )}
            {thinking ? (
              <StreamingMarkDown>{thinking + '\n' + data.wording}</StreamingMarkDown>
            ) : (
              <Markdown>{data.wording}</Markdown>
            )}

            {!isPicAbove && fileList !== null && (
              <PictureWall fileList={fileList} setFileList={setFileList} dict={dict} />
            )}
          </div>
        ) : (
          <div>
            {thinkPlaceholder ?? dict.words['generating']}... <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
      </div>
      {showButtons && data && (
        <div>
          <MultiPlatformButton
            onSubmit={() => props.onMultiPlatSubmit()}
            platforms={props.platforms}
            onPlatformChange={props.onPlatformsChange}
            dict={dict}
          />

          <Button
            color="primary"
            variant="outlined"
            style={{ marginRight: 8, borderRadius: 12 }}
            size="small"
            onClick={props.onMyStyle}
          >
            {dict.words['Personal style']}
          </Button>
          {/* <Button color="primary" variant="outlined" style={{ marginRight: 8, borderRadius: 12 }} size="small">
            {dict.words['Generate in a celebrity style']}
          </Button> */}
          {platform && platform !== dict.words['Personal style'] && (
            <Button color="primary" variant="outlined" style={{ marginRight: 8, borderRadius: 12 }} size="small">
              Share to {platform}
            </Button>
          )}
        </div>
      )}
    </>
  );
};

const PromptInput: React.FC<{
  texts: string[];
  setTexts: (fun: (texts: string[]) => string[]) => void;
  order: number;
  placeholder: string;
}> = (props) => {
  const { order, setTexts, texts, placeholder } = props;
  console.log('texts[order]', texts[order]);
  return (
    <span
      contentEditable="true"
      className={classNames(styles.inputCustom, styles[`inputCustom${order}`], { [styles.empty]: texts[order] === '' })}
      onInput={(ev) => {
        setTexts((texts) => {
          texts[order] = (ev.target as HTMLDivElement).innerText;
          return [...texts];
        });
      }}
      content={texts[order]}
      data-placeholder={placeholder}
    />
  );
};

const PlainTextInput: React.FC<{
  plainTextPrompt: string;
  setPlainTextPrompt: (fun: (plainTextPrompt: string) => string) => void;
  placeholder: string;
}> = (props) => {
  const { plainTextPrompt, setPlainTextPrompt, placeholder } = props;
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (spanRef.current && (plainTextPrompt === null || plainTextPrompt === '')) {
      spanRef.current.innerText = '';
    }
  }, [plainTextPrompt]);
  return (
    <span
      ref={spanRef}
      className={styles.inputContainer}
      contentEditable
      content={plainTextPrompt}
      onInput={(ev) => {
        setPlainTextPrompt(() => {
          (ev.target as HTMLDivElement).innerText;
          return (ev.target as HTMLDivElement).innerText;
        });
      }}
      data-placeholder={placeholder}></span>
  );
};

const fetchContent = (type: string, params: { query?: string; type?: string }) => {
  return window
    .fetch(`https://aicreator-ejc7hcd6atf3cdam.eastasia-01.azurewebsites.net/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    .then((res) => res.json())
    .then((res) => res.result as IRes);
};

const fetchCoding = (type: string, params: { prompt?: string; history?: string }) => {
  return window
    .fetch(`https://aicreator-ejc7hcd6atf3cdam.eastasia-01.azurewebsites.net/${type}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    })
    .then((res) => res.json())
    .then((res) => res.result as ICodingRes )
    .catch((error) => {
      console.error('Error fetching content:', error);
      return Promise.resolve({
        ...mockData
      } as ICodingRes ); // Fallback to mockData
  });
  // return Promise.resolve({
  //   ...mockData
  // } as ICodingRes ); // Fallback to mockData
}

const generateQuery = (creatorType: string, texts: string[], dict: IDict): string => {
  const templateItems = templateMap[creatorType];

  let query = '';

  for (let i = 0; i < templateItems.length; i++) {
    const templateValue = dict.words[templateItems[i]] || '';
    const placeholderValue = texts[i] || '';
    if (templateValue === '' && placeholderValue === '') {
      break;
    }
    query += `${templateValue}${placeholderValue}`;
    // if (i < templateItems.length - 1) {
    //   query += ', ';
    // }
  }
  query += '.';

  return query.trim(); // Remove trailing spaces
};

const generateHistory = (rounds: IRound[]): string => {
  const history = rounds.map((round) => {
    if (round.position === 'right') {
      return { role: 'prompt', content: round.content };
    } else if (round.position === 'left') {
      return { role: 'result', content: round.content };
    }
    return null; // Handle unexpected cases (optional)
  }).filter((entry) => entry !== null); // Remove null entries

  return JSON.stringify(history, null, 2); // Convert to JSON string with indentation
};
