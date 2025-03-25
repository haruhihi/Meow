'use client';
import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Button, Spin } from 'antd';
import { ArrowUpOutlined, LoadingOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';

import classNames from 'classnames';
import { typeConfigs } from './type-config';
import PictureWall from './picture-wall';
import { MultiPlatformButton } from './multi-platform-button';
import { isUrlEnable } from '@utils/tool';

const isDev = isUrlEnable('dev');

export const Main: React.FC<{ markdown: string }> = (props) => {
  const [isShowItems, setIsShowItems] = useState(false);
  const [isShowRightChat, setIsShowRightChat] = useState(isDev ? true : false);
  const [isShowLeftChat, setIsShowLeftChat] = useState(isDev ? true : false);
  const [isShowRound2, setIsShowRound2] = useState(isDev ? true : false);
  const [isShowRound3, setIsShowRound3] = useState(isDev ? true : false);
  const [isShowText, setIsShowText] = useState(isDev ? true : false);

  const { markdown } = props;

  const pillsProps = {
    onMultiPlatSubmit: () => {
      setIsShowRound2(true);
    },
    onMyStyle: () => {
      setIsShowRound3(true);
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
              {isShowRightChat && (
                <div className={styles.bubble}>
                  请帮我写朋友圈文案，主题是冬日晨光，登临北京钟楼和鼓楼游，写作长度中，配一张鼓楼经典图和一张当前热门的给鼓楼穿毛衣的图片
                </div>
              )}
              {isShowLeftChat && <div>{markdown && <MarkDownWrap {...pillsProps}>{markdown}</MarkDownWrap>}</div>}
              {isShowRound2 && (
                <>
                  {['小红书', 'Instagram'].map((item) => {
                    return (
                      <div key={item}>
                        {markdown && <MarkDownWrap {...pillsProps}>{`## ${item}风格：\n${markdown}`}</MarkDownWrap>}
                      </div>
                    );
                  })}
                </>
              )}
              {isShowRound3 && (
                <>
                  <div>
                    {markdown && (
                      <MarkDownWrap
                        {...pillsProps}
                      >{`> 思考中...用户的风格是写实风格，现在用户想要写朋友圈文案，主题是冬日晨光，登临北京钟楼和鼓楼游，写作长度中，配一张鼓楼经典图和一张当前热门的给鼓楼穿毛衣的图片\n${markdown}`}</MarkDownWrap>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className={styles.inputWrap}>
              {isShowText && (
                <div>
                  请帮我写
                  <IIput className={styles.inputCustom1} />
                  文案，主题是
                  <IIput className={styles.inputCustom2} />
                  ，写作长度
                  <IIput className={styles.inputCustom3} />，<IIput className={styles.inputCustom4} />
                </div>
              )}
              <div
                className={styles.send}
                onClick={() => {
                  setIsShowText(false);
                  setIsShowRightChat(true);
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
  children: string;
  onMultiPlatSubmit: (options: string[]) => void;
  onMyStyle: () => void;
}> = (props) => {
  const [isShow, setIsShow] = useState(isDev ? true : false);
  useEffect(() => {
    setTimeout(() => {
      setIsShow(true);
    }, 5000);
  }, []);
  return (
    <>
      <div className={styles.bubble + ' ' + styles.bubbleLeft + ' prose prose-base prose-blue max-w-none space-y-1'}>
        {isShow ? (
          <div>
            <Markdown>{props.children}</Markdown>
            <PictureWall></PictureWall>
          </div>
        ) : (
          <div>
            Thinking... <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
      </div>
      {isShow && (
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

const IIput: React.FC<{ className: string }> = (props) => {
  const [txt1, setTxt1] = useState('');
  console.log('txt1', txt1);
  return (
    <span
      contentEditable="true"
      className={classNames(styles.inputCustom, props.className, { [styles.empty]: txt1 === '' })}
      onInput={(ev) => {
        setTxt1((ev.target as HTMLDivElement).innerText);
      }}
      content={txt1}
    ></span>
  );
};
