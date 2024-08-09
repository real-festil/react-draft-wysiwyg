import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { AtomicBlockUtils } from 'draft-js';
import LayoutComponent from './Component';
import classNames from 'classnames';
import './styles.css';

class ImageControl extends Component {
  static propTypes = {
    editorState: PropTypes.object.isRequired,
    onChange: PropTypes.func.isRequired,
    modalHandler: PropTypes.object,
    config: PropTypes.object,
    translations: PropTypes.object,
  };

  constructor(props) {
    super(props);
    const { modalHandler } = this.props;
    this.state = {
      expanded: false,
    };
    modalHandler.registerCallBack(this.expandCollapse);
  }

  componentWillUnmount() {
    const { modalHandler } = this.props;
    modalHandler.deregisterCallBack(this.expandCollapse);
  }

  onExpandEvent = () => {
    this.signalExpanded = !this.state.expanded;
  };

  doExpand = () => {
    this.setState({
      expanded: true,
    });
  };

  doCollapse = () => {
    this.setState({
      expanded: false,
    });
  };

  expandCollapse = () => {
    this.setState({
      expanded: this.signalExpanded,
    });
    this.signalExpanded = false;
  };

  addImage = (src, height, width, alt) => {
    const { editorState, onChange, config } = this.props;
    const entityData = { src, height, width };
    if (config.alt.present) {
      entityData.alt = alt;
    }
    const entityKey = editorState
      .getCurrentContent()
      .createEntity('IMAGE', 'MUTABLE', entityData)
      .getLastCreatedEntityKey();
    const newEditorState = AtomicBlockUtils.insertAtomicBlock(
      editorState,
      entityKey,
      ' '
    );
    onChange(newEditorState);
    this.doCollapse();
  };

  onDrop = event => {
    event.preventDefault();
    const { config } = this.props;

    let data;
    let dataIsItems;
    if (event.dataTransfer.items) {
      data = event.dataTransfer.items;
      dataIsItems = true;
    } else {
      data = event.dataTransfer.files;
      dataIsItems = false;
    }
    for (let i = 0; i < data.length; i += 1) {
      if (
        (!dataIsItems || data[i].kind === 'file') &&
        data[i].type.match('^image/')
      ) {
        const file = dataIsItems ? data[i].getAsFile() : data[i];
        this.uploadImage(file);
      }
    }
  };

  uploadImage = file => {
    const { config } = this.props;
    const { uploadCallback } = config;

    if (uploadCallback) {
      uploadCallback(file)
        .then(({ data }) => {
          const { link, url } = data;
          const objectURL = link || url;
          const img = new Image();
          img.onload = () => {
            const width = img.width;
            const height = img.height;
            this.addImage(objectURL, height, width '');
            URL.revokeObjectURL(objectURL);
          };
          img.src = objectURL;
        })
    }
  };

  render() {
    const { config, translations, dragEnter } = this.props;
    const { expanded  } = this.state;
    const ImageComponent = config.component || LayoutComponent;

    return (
      <div className="image-control-wrapper">
        {dragEnter && <div
            className={classNames('image-control-drop-area', { 'drag-enter': dragEnter })}
            // onDrop={this.onDrop}
          >
            <p className="image-control-drop-area-text">
              Drop files here
            </p>
          </div>
        }
        <ImageComponent
          config={config}
          translations={translations}
          onChange={this.addImage}
          expanded={expanded}
          onExpandEvent={this.onExpandEvent}
          doExpand={this.doExpand}
          doCollapse={this.doCollapse}
        />
      </div>
    );
  }
}

export default ImageControl;
