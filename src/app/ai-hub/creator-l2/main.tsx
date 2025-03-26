'use client';
import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Button, message, Spin } from 'antd';
import { ArrowUpOutlined, LoadingOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';

import classNames from 'classnames';
import { typeConfigs } from './type-config';
import PictureWall from './picture-wall';
import { MultiPlatformButton } from './multi-platform-button';
import { isUrlEnable } from '@utils/tool';
import { IRes, IRound } from './help';

const isDev = isUrlEnable('dev');

export const Main: React.FC<{ markdown: string }> = () => {
  const [isShowItems, setIsShowItems] = useState(false);
  const [rounds, setRounds] = useState<IRound[]>([]);
  const [isShowText, setIsShowText] = useState(isDev ? true : false);
  const [texts, setTexts] = useState<string[]>(['', '', '', '']);

  const query = `请帮我写${texts[0]}文案，主题是${texts[1]}，写作长度${texts[2]}，${texts[3]}`;

  const pillsProps = {
    onMultiPlatSubmit: () => {
      // setIsShowRound2(true);
    },
    onMyStyle: () => {
      // setIsShowRound3(true);
    },
  };

  useEffect(() => {
    if (isDev) return;
    setIsShowItems(true);
  }, []);

  return (
    <div className={styles.wrap}>
      <aside className={styles.sideBarWrap}>
        <SideBar onClickItem={() => {}} />
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
                    <MarkDownWrap {...pillsProps} round={round}></MarkDownWrap>
                  </div>
                );
              })}
            </div>
            <div className={styles.inputWrap}>
              {isShowText && (
                <div>
                  请帮我写
                  <PromptInput texts={texts} setTexts={setTexts} order={0} />
                  文案，主题是
                  <PromptInput texts={texts} setTexts={setTexts} order={1} />
                  ，写作长度
                  <PromptInput texts={texts} setTexts={setTexts} order={2} />
                  ，
                  <PromptInput texts={texts} setTexts={setTexts} order={3} />
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
                    },
                  ]);
                  setTimeout(() => {
                    setIsShowLeftChat(true);
                  }, 500);
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
  onMultiPlatSubmit: (options: string[]) => void;
  onMyStyle: () => void;
  round: IRound;
}> = (props) => {
  const [data, setData] = useState<IRes>();
  const { round } = props;

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
  }, []);

  return (
    <>
      <div className={styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'}>
        {data ? (
          <div>
            <Markdown>{data.wording}</Markdown>
            <PictureWall initialImgs={data.imgs} />
          </div>
        ) : (
          <div>
            Thinking... <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
      </div>
      {data && (
        <div>
          <MultiPlatformButton onSubmit={props.onMultiPlatSubmit} />
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small" onClick={props.onMyStyle}>
            生成我的风格
          </Button>
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small">
            生成名人风格
          </Button>
        </div>
      )}
    </>
  );
};

const PromptInput: React.FC<{
  texts: string[];
  setTexts: (fun: (texts: string[]) => string[]) => void;
  order: number;
}> = (props) => {
  const { order, setTexts, texts } = props;
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
