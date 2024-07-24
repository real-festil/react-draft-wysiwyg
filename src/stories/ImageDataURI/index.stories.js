/* @flow */

import React from "react";
import { Editor } from "../..";

import "../styles.css";

const uploadImageCallBack = (file) => {
      console.log('file', file);
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({ data: { link: e.target.result } });
        };
        reader.onerror = (error) => {
          console.error('Error reading file', error);
          reject(error);
        };
        reader.readAsDataURL(file);
      });
}


const ImageDataURIComponent = () => (
  <div className="rdw-storybook-root">
    <h3>Image upload can render image as base64.</h3>
    <Editor
      toolbarClassName="rdw-storybook-toolbar"
      wrapperClassName="rdw-storybook-wrapper"
      editorClassName="rdw-storybook-editor"
      toolbar={{
        image: {
          uploadCallback: uploadImageCallBack,
          previewImage: true,
          instaUpload: true,
        },
      }}
    />
  </div>
);

export default {
  title: "Editor",
  component: ImageDataURIComponent,
};

export const ImageDataURI = {
  args: {},
};
