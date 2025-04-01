'use client';
import { useState, useEffect } from 'react';
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
import { IRes, IRound, StreamingMarkDown } from './help';
import pako from 'pako';
import { IDict } from './dictionaries';

const isDev = isUrlEnable('dev');

export const Main: React.FC<{ dict: IDict }> = ({ dict }) => {
  // const [isShowItems, setIsShowItems] = useState(false);
  const [rounds, setRounds] = useState<IRound[]>([]);
  const [isShowTemplatePrompt, setIsShowTemplatePrompt] = useState(isDev ? true : false);
  const [texts, setTexts] = useState<string[]>(['', '', '', '']);
  const [fileList, setFileList] = useState<UploadFile[]>();
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [plainTextPrompt, setPlainTextPrompt] = useState<string>();
  const typeConfigs = getTypeConfigs(dict);
  const { words } = dict;
  const query = `${words['Please help me write a post for']} ${texts[0]}, ${words['the topic is']} ${texts[1]}, ${words['the length is']} ${texts[2]}, ${texts[3]}`;

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

  const isShowSelection = isEmptyPlainTextPrompt && !isShowTemplatePrompt;

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
                    <MarkDownWrap
                      {...pillsProps}
                      round={round}
                      fileList={fileList}
                      setFileList={setFileList}
                      dict={dict}
                    ></MarkDownWrap>
                  </div>
                );
              })}
            </div>

            <div className={styles.inputWrap}>
              {isShowTemplatePrompt ? (
                <div className={styles.inputContainer}>
                  <>
                    <div className={styles.templateInputWrapper}>
                      {dict.words['Please help me write a post for']}{' '}
                      <PromptInput
                        texts={texts}
                        setTexts={setTexts}
                        order={0}
                        placeholder={words['what social media platform']}
                      />
                      , {dict.words['the topic is']}{' '}
                      <PromptInput texts={texts} setTexts={setTexts} order={1} placeholder={words['what topic']} />,{' '}
                      {dict.words['the length is']}{' '}
                      <PromptInput
                        texts={texts}
                        setTexts={setTexts}
                        order={2}
                        placeholder={words['short/medium/long']}
                      />
                      ,{' '}
                      <PromptInput
                        texts={texts}
                        setTexts={setTexts}
                        order={3}
                        placeholder={words['other requirements']}
                      />
                      .
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
                <span
                  className={styles.inputContainer}
                  contentEditable
                  content={plainTextPrompt}
                  onInput={(ev) => setPlainTextPrompt((ev.target as HTMLDivElement).innerText)}
                />
              )}

              <div
                className={styles.send}
                onClick={() => {
                  if (isShowTemplatePrompt) {
                    setRounds([
                      ...rounds,
                      { query, position: 'right', content: query },
                      {
                        query,
                        position: 'left',
                        load: () => fetchContent('wording', { query: query, type: texts[0] }),
                      },
                    ]);
                    return;
                  }

                  if (!isEmptyPlainTextPrompt) {
                    setRounds([
                      ...rounds,
                      { query: plainTextPrompt, position: 'right', content: plainTextPrompt },
                      {
                        query,
                        position: 'left',
                        load: () => fetchContent('wording', { query: plainTextPrompt }),
                        showButtons: false,
                      },
                    ]);
                  }
                }}
              >
                <ArrowUpOutlined />
              </div>
            </div>

            <div
              className={styles.items}
              style={{ opacity: isShowSelection ? 1 : 0, pointerEvents: isShowSelection ? 'auto' : 'none' }}
              onClick={() => {
                setPlainTextPrompt('');
                setIsShowTemplatePrompt(true);
              }}
            >
              {typeConfigs.map((item) => (
                <div key={item.key} className={styles.item}>
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
  fileList?: UploadFile[];
  setFileList: (files: UploadFile[]) => void;
  dict: IDict;
}> = (props) => {
  const [data, setData] = useState<IRes>();
  const [imgs, setImgs] = useState<UploadFile<any>[] | null>();
  const {
    dict,
    round,
    round: { thinkPlaceholder, platform, showButtons = true },
    fileList,
    // setFileList,
  } = props;

  useEffect(() => {
    if (round.load) {
      round
        .load()
        .then((res) => {
          setData(res);
        })
        .catch((err) => {
          console.log(err);
          message.error(dict.words['Generation failed']);
        });
    }
  }, []);
  useEffect(() => {
    if (data === undefined) return;
    if (!data?.imgPrompt) {
      setImgs(null);
      //setImgs([...(fileList ?? [])]);
      return;
    }
    // console.log('start fetch img');
    fetchContent('img', { query: data.imgPrompt })
      .then((res) => {
        setImgs(
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
  console.log('imgs', typeof imgs, imgs);
  return (
    <>
      <div className={styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'}>
        {data ? (
          <div>
            <Markdown>{appendHeader}</Markdown>
            {thinking ? (
              <StreamingMarkDown>{thinking + '\n' + data.wording}</StreamingMarkDown>
            ) : (
              <Markdown>{data.wording}</Markdown>
            )}

            {imgs !== null && <PictureWall fileList={imgs} setFileList={setImgs} dict={dict} />}
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

const fetchContent = (type: 'wording' | 'img', params: { query?: string; type?: string }) => {
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
