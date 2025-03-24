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
export const Main: React.FC<{ markdown: string }> = (props) => {
  const [isShowItems, setIsShowItems] = useState(false);
  const [isShowRightChat, setIsShowRightChat] = useState(false);
  const [isShowLeftChat, setIsShowLeftChat] = useState(false);
  const [isShowText, setIsShowText] = useState(false);

  const { markdown } = props;

  useEffect(() => {
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
              {isShowRightChat && <div className={styles.bubble}>请帮我写朋友圈文案，主题是冬日晨光，登临北京钟楼和鼓楼游，写作长度中，配一张鼓楼经典图和一张当前热门的给鼓楼穿毛衣的图片</div>}
              {isShowLeftChat && <div>{markdown && <MarkDownWrap>{markdown}</MarkDownWrap>}
                
              </div>}
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

const MarkDownWrap: React.FC<{ children: string }> = (props) => {
  const [isShow, setIsShow] = useState(false);
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
            Thinking <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
      </div>
      {isShow && (
        <div>
          <MultiPlatformButton />
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }} size="small">
            生成我的风格
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
