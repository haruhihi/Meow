'use client';
import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Button, message, Spin } from 'antd';
import { ArrowUpOutlined, LoadingOutlined } from '@ant-design/icons';
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
  const [isShowItems, setIsShowItems] = useState(false);
  const [rounds, setRounds] = useState<IRound[]>([]);
  const [isShowText, setIsShowText] = useState(isDev ? true : false);
  const [texts, setTexts] = useState<string[]>(['', '', '', '']);
  const [fileList, setFileList] = useState<UploadFile[]>();
  const [platforms, setPlatforms] = useState<string[]>([]);
  const typeConfigs = getTypeConfigs(dict);
  const { words } = dict;
  const query = `${words['Please help me write for']} ${texts[0]}, ${words['the topic is']} ${texts[1]}, ${words['the length is']} ${texts[2]}, ${texts[3]}`;

  const pillsProps = {
    platforms,
    onPlatformsChange: (v: string[]) => setPlatforms(v),
    onMultiPlatSubmit: () => {
      setRounds([
        ...rounds,
        ...platforms.map((platform) => {
          return {
            position: 'left' as const,
            load: () => fetchContent('wording', { query: query, type: platform }),
            thinkPlaceholder: `正在生成${platform}文案...`,
            platform,
          };
        }),
      ]);
    },
    onMyStyle: () => {
      setRounds([
        ...rounds,
        {
          position: 'left' as const,
          load: () => fetchContent('wording', { query: query, type: '生成个人风格' }),
          thinkPlaceholder: `正在生成符合您风格的文案...`,
          platform: '个人风格',
        },
      ]);
    },
  };

  useEffect(() => {
    if (isDev) return;
    setIsShowItems(true);
  }, []);

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
                      {query}
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
              {isShowText && (
                <div>
                  {dict.words['Please help me write for']}
                  <PromptInput
                    texts={texts}
                    setTexts={setTexts}
                    order={0}
                    placeholder={words['what social media platform']}
                  />
                  , {dict.words['the topic is']}
                  <PromptInput texts={texts} setTexts={setTexts} order={1} placeholder={words['what topic']} />,{' '}
                  {dict.words['the length is']}
                  <PromptInput
                    texts={texts}
                    setTexts={setTexts}
                    order={2}
                    placeholder={words['short/medium/long']}
                  />,{' '}
                  <PromptInput texts={texts} setTexts={setTexts} order={3} placeholder={words['other requirements']} />
                </div>
              )}
              <div
                className={styles.send}
                onClick={() => {
                  setIsShowText(false);
                  setRounds([
                    ...rounds,
                    { position: 'right', content: query },
                    {
                      position: 'left',
                      load: () => fetchContent('wording', { query: query }),
                      loadImgs: () => fetchContent('img', { query: query }),
                    },
                  ]);
                }}
              >
                <ArrowUpOutlined />
              </div>
            </div>
            <div
              className={styles.items}
              style={{ opacity: isShowItems ? 1 : 0, pointerEvents: isShowItems ? 'auto' : 'none' }}
              onClick={() => {
                setIsShowItems(false);
                setIsShowText(true);
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
  const {
    dict,
    round,
    round: { thinkPlaceholder, loadImgs, platform },
    fileList,
    setFileList,
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
          message.error('内容生成数据失败');
        });
    }
    if (loadImgs) {
      loadImgs()
        .then((res) => {
          console.log('图片生成', res);
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
          message.error('图片生成失败');
        });
    }
  }, []);
  const appendHeader = platform ? `## ${platform}\n` : '';

  return (
    <>
      <div className={styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'}>
        {data ? (
          <div>
            {platform === '个人风格' ? (
              <>
                <Markdown>{`## 您的风格\n${
                  data.thinking
                    ? data.thinking
                        .split('\n') // 按换行拆分每一行
                        .map((line) => '> ' + line.trim()) // 每行前加上 >，并去掉首尾空白
                        .join('\n')
                    : '思考中...'
                }\n${data.wording}`}</Markdown>
                <PictureWall fileList={fileList} setFileList={setFileList} />
              </>
            ) : (
              <>
                <Markdown>{`${appendHeader}${data.wording}`}</Markdown>
                <PictureWall fileList={fileList} setFileList={setFileList} />
              </>
            )}
          </div>
        ) : (
          <div>
            {thinkPlaceholder ?? dict.words['generating']}... <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
      </div>
      {data && (
        <div>
          <MultiPlatformButton
            onSubmit={() => props.onMultiPlatSubmit()}
            platforms={props.platforms}
            onPlatformChange={props.onPlatformsChange}
          />
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small" onClick={props.onMyStyle}>
            生成我的风格
          </Button>
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small">
            生成名人风格
          </Button>
          {platform && platform !== '个人风格' && (
            <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small">
              一键发布到{platform}
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
    .then((res) => res.result);
};
