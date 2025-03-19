'use client';
import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { SideBar } from './side-bar';
import { Button, Spin } from 'antd';
import { items } from './side-bar/config';
import { ArrowUpOutlined, LoadingOutlined } from '@ant-design/icons';
import Markdown from 'react-markdown';

import classNames from 'classnames';
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
              {isShowRightChat && <div className={styles.bubble}>Write a poem about spring with emoji.</div>}
              {isShowLeftChat && <MarkDownWrap>{markdown}</MarkDownWrap>}
            </div>
            <div className={styles.inputWrap}>
              {isShowText && (
                <div>
                  Write a poem about <IIput className={styles.inputCustom1} /> with{' '}
                  <IIput className={styles.inputCustom2} />.
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
              {items.map((item) => (
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
            {/* Add two button */}
          </div>
        ) : (
          <div>
            Thinking <Spin indicator={<LoadingOutlined spin />} size="small" />
          </div>
        )}
      </div>
      {isShow && (
        <div>
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }}>
            Make it shorter
          </Button>
          <Button color="primary" variant="outlined" style={{ marginRight: 4 }}>
            Make it longer
          </Button>
          <Button color="primary" variant="outlined">
            Create an image for it
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
