import React, { Component } from "react";
import PropTypes from "prop-types";
import {
  Editor,
  EditorState,
  AtomicBlockUtils,
  RichUtils,
  convertToRaw,
  convertFromRaw,
  CompositeDecorator,
  getDefaultKeyBinding,
} from "draft-js";
import {
  changeDepth,
  handleNewLine,
  blockRenderMap,
  getCustomStyleMap,
  extractInlineStyle,
  getSelectedBlocksType,
} from "draftjs-utils";
import classNames from "classnames";
import ModalHandler from "../event-handler/modals";
import FocusHandler from "../event-handler/focus";
import KeyDownHandler from "../event-handler/keyDown";
import SuggestionHandler from "../event-handler/suggestions";
import blockStyleFn from "../utils/BlockStyle";
import { mergeRecursive } from "../utils/toolbar";
import { hasProperty, filter } from "../utils/common";
import { handlePastedText } from "../utils/handlePaste";
import Controls from "../controls";
import getLinkDecorator from "../decorators/Link";
import getMentionDecorators from "../decorators/Mention";
import getHashtagDecorator from "../decorators/HashTag";
import getBlockRenderFunc from "../renderer";
import defaultToolbar from "../config/defaultToolbar";
import localeTranslations from "../i18n";
import "./styles.css";
import "../../css/Draft.css";

class WysiwygEditor extends Component {
  constructor(props) {
    super(props);
    const toolbar = mergeRecursive(defaultToolbar, props.toolbar);
    const wrapperId = props.wrapperId
      ? props.wrapperId
      : Math.floor(Math.random() * 10000);
    this.wrapperId = `rdw-wrapper-${wrapperId}`;
    this.modalHandler = new ModalHandler();
    this.focusHandler = new FocusHandler();
    this.blockRendererFn = getBlockRenderFunc(
      {
        isReadOnly: this.isReadOnly,
        isImageAlignmentEnabled: this.isImageAlignmentEnabled,
        getEditorState: this.getEditorState,
        onChange: this.onChange,
      },
      props.customBlockRenderFunc
    );
    this.editorProps = this.filterEditorProps(props);
    this.customStyleMap = this.getStyleMap(props);
    this.compositeDecorator = this.getCompositeDecorator(toolbar);
    const editorState = this.createEditorState(this.compositeDecorator);
    extractInlineStyle(editorState);
    this.state = {
      editorState,
      editorFocused: false,
      toolbar,
      dragEnter: false,
      dragEnterCount: 0,
    };
  }

  componentDidMount() {
    this.modalHandler.init(this.wrapperId);
  }
  // todo: change decorators depending on properties recceived in componentWillReceiveProps.

  componentDidUpdate(prevProps) {
    if (prevProps === this.props) return;
    const newState = {};
    const { editorState, contentState } = this.props;
    if (!this.state.toolbar) {
      const toolbar = mergeRecursive(defaultToolbar, toolbar);
      newState.toolbar = toolbar;
    }
    if (
      hasProperty(this.props, "editorState") &&
      editorState !== prevProps.editorState
    ) {
      if (editorState) {
        newState.editorState = EditorState.set(editorState, {
          decorator: this.compositeDecorator,
        });
      } else {
        newState.editorState = EditorState.createEmpty(this.compositeDecorator);
      }
    } else if (
      hasProperty(this.props, "contentState") &&
      contentState !== prevProps.contentState
    ) {
      if (contentState) {
        const newEditorState = this.changeEditorState(contentState);
        if (newEditorState) {
          newState.editorState = newEditorState;
        }
      } else {
        newState.editorState = EditorState.createEmpty(this.compositeDecorator);
      }
    }
    if (
      prevProps.editorState !== editorState ||
      prevProps.contentState !== contentState
    ) {
      extractInlineStyle(newState.editorState);
    }
    if (Object.keys(newState).length) this.setState(newState);
    this.editorProps = this.filterEditorProps(this.props);
    this.customStyleMap = this.getStyleMap(this.props);
  }

  onEditorBlur = () => {
    this.setState({
      editorFocused: false,
    });
  };

  onEditorFocus = (event) => {
    const { onFocus } = this.props;
    this.setState({
      editorFocused: true,
    });
    const editFocused = this.focusHandler.isEditorFocused();
    if (onFocus && editFocused) {
      onFocus(event);
    }
  };

  onEditorMouseDown = () => {
    this.focusHandler.onEditorMouseDown();
  };

  keyBindingFn = (event) => {
    if (event.key === "Tab") {
      const { onTab } = this.props;
      if (!onTab || !onTab(event)) {
        const editorState = changeDepth(
          this.state.editorState,
          event.shiftKey ? -1 : 1,
          4
        );
        if (editorState && editorState !== this.state.editorState) {
          this.onChange(editorState);
          event.preventDefault();
        }
      }
      return null;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (SuggestionHandler.isOpen()) {
        event.preventDefault();
      }
    }
    return getDefaultKeyBinding(event);
  };

  onToolbarFocus = (event) => {
    const { onFocus } = this.props;
    if (onFocus && this.focusHandler.isToolbarFocused()) {
      onFocus(event);
    }
  };

  onWrapperBlur = (event) => {
    const { onBlur } = this.props;
    if (onBlur && this.focusHandler.isEditorBlur(event)) {
      onBlur(event, this.getEditorState());
    }
  };

  onChange = (editorState) => {
    const { readOnly, onEditorStateChange } = this.props;
    if (
      !readOnly &&
      !(
        getSelectedBlocksType(editorState) === "atomic" &&
        editorState.getSelection().isCollapsed
      )
    ) {
      if (onEditorStateChange) {
        onEditorStateChange(editorState, this.props.wrapperId);
      }
      if (!hasProperty(this.props, "editorState")) {
        this.setState({ editorState }, this.afterChange(editorState));
      } else {
        this.afterChange(editorState);
      }
    }
  };

  setWrapperReference = (ref) => {
    this.wrapper = ref;
  };

  setEditorReference = (ref) => {
    if (this.props.editorRef) {
      this.props.editorRef(ref);
    }
    this.editor = ref;
  };

  getCompositeDecorator = (toolbar) => {
    const decorators = [
      ...this.props.customDecorators,
      getLinkDecorator({
        showOpenOptionOnHover: toolbar.link.showOpenOptionOnHover,
      }),
    ];
    if (this.props.mention) {
      decorators.push(
        ...getMentionDecorators({
          ...this.props.mention,
          onChange: this.onChange,
          getEditorState: this.getEditorState,
          getSuggestions: this.getSuggestions,
          getWrapperRef: this.getWrapperRef,
          modalHandler: this.modalHandler,
        })
      );
    }
    if (this.props.hashtag) {
      decorators.push(getHashtagDecorator(this.props.hashtag));
    }
    return new CompositeDecorator(decorators);
  };

  getWrapperRef = () => this.wrapper;

  getEditorState = () => (this.state ? this.state.editorState : null);

  getSuggestions = () => this.props.mention && this.props.mention.suggestions;

  afterChange = (editorState) => {
    setTimeout(() => {
      const { onChange, onContentStateChange } = this.props;
      if (onChange) {
        onChange(convertToRaw(editorState.getCurrentContent()));
      }
      if (onContentStateChange) {
        onContentStateChange(convertToRaw(editorState.getCurrentContent()));
      }
    });
  };

  isReadOnly = () => this.props.readOnly;

  isImageAlignmentEnabled = () => this.state.toolbar.image.alignmentEnabled;

  createEditorState = (compositeDecorator) => {
    let editorState;
    if (hasProperty(this.props, "editorState")) {
      if (this.props.editorState) {
        editorState = EditorState.set(this.props.editorState, {
          decorator: compositeDecorator,
        });
      }
    } else if (hasProperty(this.props, "defaultEditorState")) {
      if (this.props.defaultEditorState) {
        editorState = EditorState.set(this.props.defaultEditorState, {
          decorator: compositeDecorator,
        });
      }
    } else if (hasProperty(this.props, "contentState")) {
      if (this.props.contentState) {
        const contentState = convertFromRaw(this.props.contentState);
        editorState = EditorState.createWithContent(
          contentState,
          compositeDecorator
        );
        editorState = EditorState.moveSelectionToEnd(editorState);
      }
    } else if (
      hasProperty(this.props, "defaultContentState") ||
      hasProperty(this.props, "initialContentState")
    ) {
      let contentState =
        this.props.defaultContentState || this.props.initialContentState;
      if (contentState) {
        contentState = convertFromRaw(contentState);
        editorState = EditorState.createWithContent(
          contentState,
          compositeDecorator
        );
        editorState = EditorState.moveSelectionToEnd(editorState);
      }
    }
    if (!editorState) {
      editorState = EditorState.createEmpty(compositeDecorator);
    }
    return editorState;
  };

  filterEditorProps = (props) =>
    filter(props, [
      "onChange",
      "onEditorStateChange",
      "onContentStateChange",
      "initialContentState",
      "defaultContentState",
      "contentState",
      "editorState",
      "defaultEditorState",
      "locale",
      "localization",
      "toolbarOnFocus",
      "toolbar",
      "toolbarCustomButtons",
      "toolbarClassName",
      "editorClassName",
      "toolbarHidden",
      "wrapperClassName",
      "toolbarStyle",
      "editorStyle",
      "wrapperStyle",
      "uploadCallback",
      "onFocus",
      "onBlur",
      "onTab",
      "mention",
      "hashtag",
      "ariaLabel",
      "customBlockRenderFunc",
      "customDecorators",
      "handlePastedText",
      "customStyleMap",
    ]);

  getStyleMap = (props) => ({
    ...getCustomStyleMap(),
    ...props.customStyleMap,
  });

  changeEditorState = (contentState) => {
    const newContentState = convertFromRaw(contentState);
    let { editorState } = this.state;
    editorState = EditorState.push(
      editorState,
      newContentState,
      "insert-characters"
    );
    editorState = EditorState.moveSelectionToEnd(editorState);
    return editorState;
  };

  focusEditor = () => {
    setTimeout(() => {
      this.editor.focus();
    });
  };

  handleKeyCommand = (command) => {
    const {
      editorState,
      toolbar: { inline },
    } = this.state;
    if (inline && inline.options.indexOf(command) >= 0) {
      const newState = RichUtils.handleKeyCommand(editorState, command);
      if (newState) {
        this.onChange(newState);
        return true;
      }
    }
    return false;
  };

  handleReturn = (event) => {
    if (SuggestionHandler.isOpen()) {
      return true;
    }
    const { editorState } = this.state;
    const newEditorState = handleNewLine(editorState, event);
    if (newEditorState) {
      this.onChange(newEditorState);
      return true;
    }
    return false;
  };

  handlePastedTextFn = (text, html) => {
    const { editorState } = this.state;
    const { handlePastedText: handlePastedTextProp, stripPastedStyles } =
      this.props;

    if (handlePastedTextProp) {
      return handlePastedTextProp(text, html, editorState, this.onChange);
    }
    if (!stripPastedStyles) {
      return handlePastedText(text, html, editorState, this.onChange);
    }
    return false;
  };

  preventDefault = (event) => {
    if (
      event.target.tagName === "INPUT" ||
      event.target.tagName === "LABEL" ||
      event.target.tagName === "TEXTAREA"
    ) {
      this.focusHandler.onInputMouseDown();
    } else {
      event.preventDefault();
    }
  };

    handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState((prevState) => {
      const newCount = prevState.dragEnterCount + 1;
      return {
        dragEnterCount: newCount,
        dragEnter: newCount > 0,
      };
    });
  };

  handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.setState((prevState) => {
      const newCount = prevState.dragEnterCount - 1;
      return {
        dragEnterCount: newCount,
        dragEnter: newCount > 0,
      };
    });
  };

  handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();

    const { editorState } = this.state;
    const file = event.dataTransfer.files[0];

    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();

      reader.onload = (e) => {
        const contentState = editorState.getCurrentContent();
        const contentStateWithEntity = contentState.createEntity(
          'IMAGE',
          'IMMUTABLE',
          { src: e.target.result }
        );

        const entityKey = contentStateWithEntity.getLastCreatedEntityKey();
        let newEditorState = AtomicBlockUtils.insertAtomicBlock(
          editorState,
          entityKey,
          ' '
        );

        // Обновляем состояние редактора напрямую через setState
        // this.setState({
        //   editorState: EditorState.forceSelection(
        //     newEditorState,
        //     newEditorState.getCurrentContent().getSelectionAfter()
        //   ),
        // });
        this.onChange(newEditorState);
      };

      reader.readAsDataURL(file); // Читаем файл как DataURL
    }
  };

  onDrop = event => {
    event.preventDefault();
    const { config } = this.props;

    this.setState((prevState) => {
      return {
        dragEnterCount: 0,
        dragEnter: false,
      };
    });

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

  addImage = (src, height, width, alt = "image") => {
    const { editorState } = this.state;
    const entityData = { src, height, width };

    const entityKey = editorState
      .getCurrentContent()
      .createEntity('IMAGE', 'MUTABLE', entityData)
      .getLastCreatedEntityKey();
    const newEditorState = AtomicBlockUtils.insertAtomicBlock(
      editorState,
      entityKey,
      ' '
    );
    this.onChange(newEditorState);
    this.doCollapse();
  };

  uploadImage = file => {
    const { config, toolbar: {image: { uploadCallback }} } = this.props;


    if (uploadCallback) {
      uploadCallback(file)
        .then(({ data }) => {
          const { link, url } = data;
          const objectURL = link || url;
          const img = new Image();
          img.onload = () => {
            const width = img.width;
            const height = img.height;
            this.addImage(objectURL, height, width, '');
            URL.revokeObjectURL(objectURL);
          };
          img.src = objectURL;
        })
    }
  };

  onPaste = (event) => {
    const { editorState } = this.state;

    const clipboardData = event.clipboardData || window.clipboardData;
    const items = clipboardData.items;

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        this.uploadImage(file);
        event.preventDefault();
        break;
      }
    }
  };

  render() {
    const { editorState, editorFocused, toolbar } = this.state;
    const {
      locale,
      localization: { locale: newLocale, translations },
      toolbarCustomButtons,
      toolbarOnFocus,
      toolbarClassName,
      toolbarHidden,
      editorClassName,
      wrapperClassName,
      toolbarStyle,
      editorStyle,
      wrapperStyle,
      uploadCallback,
      ariaLabel,
    } = this.props;

    const controlProps = {
      modalHandler: this.modalHandler,
      editorState,
      onChange: this.onChange,
      translations: {
        ...localeTranslations[locale || newLocale],
        ...translations,
      },
    };
    const toolbarShow =
      editorFocused || this.focusHandler.isInputFocused() || !toolbarOnFocus;

    return (
      <div
        id={this.wrapperId}
        className={classNames(wrapperClassName, "rdw-editor-wrapper")}
        style={wrapperStyle}
        onClick={this.modalHandler.onEditorClick}
        onBlur={this.onWrapperBlur}
        aria-label="rdw-wrapper"
        onDragEnter={this.handleDragEnter}
        onDragLeave={this.handleDragLeave}
        onDrop={this.onDrop}
        onDragOver={(e) => e.preventDefault()}
        onPaste={this.onPaste}
      >
        {!toolbarHidden && (
          <div
            className={classNames("rdw-editor-toolbar", toolbarClassName)}
            style={{
              visibility: toolbarShow ? "visible" : "hidden",
              ...toolbarStyle,
            }}
            onMouseDown={this.preventDefault}
            aria-label="rdw-toolbar"
            aria-hidden={(!editorFocused && toolbarOnFocus).toString()}
            onFocus={this.onToolbarFocus}
          >
            {toolbar.options.map((opt, index) => {
              const Control = Controls[opt];
              const config = toolbar[opt];
              if (opt === "image" && uploadCallback) {
                config.uploadCallback = uploadCallback;
              }
              return <Control key={index} {...controlProps} config={config} dragEnter={this.state.dragEnter} />;
            })}
            {toolbarCustomButtons &&
              toolbarCustomButtons.map((button, index) =>
                React.cloneElement(button, { key: index, ...controlProps })
              )}
          </div>
        )}
        <div
          ref={this.setWrapperReference}
          className={classNames(editorClassName, "rdw-editor-main")}
          style={editorStyle}
          onClick={this.focusEditor}
          onFocus={this.onEditorFocus}
          onBlur={this.onEditorBlur}
          onKeyDown={KeyDownHandler.onKeyDown}
          onMouseDown={this.onEditorMouseDown}
        >
          <Editor
            ref={this.setEditorReference}
            keyBindingFn={this.keyBindingFn}
            editorState={editorState}
            onChange={this.onChange}
            blockStyleFn={blockStyleFn}
            customStyleMap={this.getStyleMap(this.props)}
            handleReturn={this.handleReturn}
            handlePastedText={this.handlePastedTextFn}
            blockRendererFn={this.blockRendererFn}
            handleKeyCommand={this.handleKeyCommand}
            ariaLabel={ariaLabel || "rdw-editor"}
            blockRenderMap={blockRenderMap}
            {...this.editorProps}
          />
        </div>
      </div>
    );
  }
}

WysiwygEditor.propTypes = {
  onChange: PropTypes.func,
  onEditorStateChange: PropTypes.func,
  onContentStateChange: PropTypes.func,
  // initialContentState is deprecated
  initialContentState: PropTypes.object,
  defaultContentState: PropTypes.object,
  contentState: PropTypes.object,
  editorState: PropTypes.object,
  defaultEditorState: PropTypes.object,
  toolbarOnFocus: PropTypes.bool,
  spellCheck: PropTypes.bool, // eslint-disable-line react/no-unused-prop-types
  stripPastedStyles: PropTypes.bool, // eslint-disable-line react/no-unused-prop-types
  toolbar: PropTypes.object,
  toolbarCustomButtons: PropTypes.array,
  toolbarClassName: PropTypes.string,
  toolbarHidden: PropTypes.bool,
  locale: PropTypes.string,
  localization: PropTypes.object,
  editorClassName: PropTypes.string,
  wrapperClassName: PropTypes.string,
  toolbarStyle: PropTypes.object,
  editorStyle: PropTypes.object,
  wrapperStyle: PropTypes.object,
  uploadCallback: PropTypes.func,
  onFocus: PropTypes.func,
  onBlur: PropTypes.func,
  onTab: PropTypes.func,
  mention: PropTypes.object,
  hashtag: PropTypes.object,
  textAlignment: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  readOnly: PropTypes.bool,
  tabIndex: PropTypes.number, // eslint-disable-line react/no-unused-prop-types
  placeholder: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  ariaLabel: PropTypes.string,
  ariaOwneeID: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  ariaActiveDescendantID: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  ariaAutoComplete: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  ariaDescribedBy: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  ariaExpanded: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  ariaHasPopup: PropTypes.string, // eslint-disable-line react/no-unused-prop-types
  customBlockRenderFunc: PropTypes.func,
  wrapperId: PropTypes.number,
  customDecorators: PropTypes.array,
  editorRef: PropTypes.func,
  handlePastedText: PropTypes.func,
};

WysiwygEditor.defaultProps = {
  toolbarOnFocus: false,
  toolbarHidden: false,
  stripPastedStyles: false,
  localization: { locale: "en", translations: {} },
  customDecorators: [],
};

export default WysiwygEditor;

// todo: evaluate draftjs-utils to move some methods here
// todo: move color near font-family
