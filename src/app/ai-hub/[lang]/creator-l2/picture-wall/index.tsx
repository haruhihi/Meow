import React, { useState } from 'react';
import { PlusOutlined } from '@ant-design/icons';
import { Image, Spin, Upload } from 'antd';
import type { GetProp, UploadFile, UploadProps } from 'antd';
import { IDict } from '../dictionaries';

type FileType = Parameters<GetProp<UploadProps, 'beforeUpload'>>[0];

const getBase64 = (file: FileType): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

const PictureWall: React.FC<{ fileList?: UploadFile[]; setFileList: (files: UploadFile[]) => void; dict: IDict }> = ({
  fileList,
  setFileList,
  dict,
}) => {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewImage, setPreviewImage] = useState('');

  const handlePreview = async (file: UploadFile) => {
    if (!file.url && !file.preview) {
      file.preview = await getBase64(file.originFileObj as FileType);
    }

    setPreviewImage(file.url || (file.preview as string));
    setPreviewOpen(true);
  };

  const handleChange: UploadProps['onChange'] = ({ fileList: newFileList }) => setFileList(newFileList);

  const uploadButton = (
    <button style={{ border: 0, background: 'none' }} type="button">
      <PlusOutlined />
      <div style={{ marginTop: 8 }}>Upload</div>
    </button>
  );
  if (fileList === undefined) {
    return (
      <div>
        <Spin tip="正在生成图片..." /> {dict.words['Generating image']}...
      </div>
    );
  }
  return (
    <>
      <Upload
        action={'/api/ai-hub-manage/upload-mock'}
        listType="picture-card"
        fileList={fileList}
        onPreview={handlePreview}
        onChange={handleChange}
      >
        {fileList.length >= 4 ? null : uploadButton}
      </Upload>
      {previewImage && (
        <Image
          wrapperStyle={{ display: 'none', margin: 0 }}
          preview={{
            visible: previewOpen,
            onVisibleChange: (visible) => setPreviewOpen(visible),
            afterOpenChange: (visible) => !visible && setPreviewImage(''),
          }}
          alt="preview"
          src={previewImage}
        />
      )}
    </>
  );
};

export default PictureWall;
