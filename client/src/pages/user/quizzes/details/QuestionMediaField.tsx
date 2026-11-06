import { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowUpFromBracket,
  faFilm,
  faImage,
  faMusic,
  faPlay,
} from '@fortawesome/free-solid-svg-icons';
import classNames from 'classnames';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import FormField from '@jerecocc/tracker-ui/components/FormField/FormField';
import Input from '@jerecocc/tracker-ui/components/Input/Input';
import SegmentedControl from '@jerecocc/tracker-ui/components/SegmentedControl/SegmentedControl';
import { MAX_UPLOAD_BYTES, uploadQuestionMedia, useUploadsEnabled } from '@/hooks/useUploads';
import { getApiErrorMessage } from '@/lib/apiClient';
import {
  MAX_MEDIA,
  MEDIA_KIND_LABELS,
  MEDIA_TYPE_INFO,
  imageLinkFromHtml,
  mediaKindFromFile,
  mediaKindFromLink,
  mediaType,
  youtubeVideoId,
  type MediaKind,
  type MediaType,
  type QuestionMedia,
} from '@/lib/quizzes';
import styles from './QuizDetails.module.scss';

const KIND_ICONS = { image: faImage, video: faFilm, audio: faMusic, youtube: faPlay };

const TYPE_OPTIONS = (Object.keys(MEDIA_TYPE_INFO) as MediaType[]).map((type) => ({
  value: type,
  label: MEDIA_TYPE_INFO[type].label,
}));

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** What the planner sees for an item: its file name, or the kind and where it's from. */
const mediaLabel = (item: QuestionMedia) => {
  if (item.name) return item.name;
  const kind = capitalize(MEDIA_KIND_LABELS[item.kind].singular);
  if (item.kind === 'youtube') return kind;
  try {
    return `${kind} from ${new URL(item.url).hostname.replace(/^www\./, '')}`;
  } catch {
    return kind;
  }
};

/** A small preview: the photo, a playable video or clip, or the YouTube thumbnail. */
const MediaPreview = ({ item }: { item: QuestionMedia }) => {
  if (item.kind === 'image') {
    return (
      <img
        className={styles.mediaThumb}
        src={item.url}
        alt=""
      />
    );
  }
  if (item.kind === 'video') {
    return (
      <video
        className={styles.mediaThumb}
        src={item.url}
        controls
        preload="metadata"
      />
    );
  }
  if (item.kind === 'audio') {
    return (
      <audio
        className={styles.mediaAudio}
        src={item.url}
        controls
        preload="metadata"
      />
    );
  }
  const id = youtubeVideoId(item.url);
  return (
    <a
      className={styles.mediaThumbLink}
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Watch ${mediaLabel(item)} on YouTube`}
    >
      <img
        className={styles.mediaThumb}
        src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`}
        alt=""
      />
    </a>
  );
};

type Upload = { name: string; percentage: number };

interface Props {
  value: QuestionMedia[];
  onChange: (media: QuestionMedia[]) => void;
  /** Lets the form wait for an upload before saving. */
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
}

/**
 * The one photo, video, sound clip or YouTube video shown with a question: an uploaded file
 * (when uploads are set up) or a link. The planner picks Photo, Video or Audio first, which sets
 * what the picker offers. Pasting a copied file anywhere in the form uploads it, replacing any
 * media already there, like the score card's hero image. Pasting a link into the empty link box
 * adds it. Whatever is added, the picked type follows it.
 */
const QuestionMediaField = (props: Props) => {
  const { value, onChange, onUploadingChange, disabled = false } = props;
  const uploadsEnabled = useUploadsEnabled();
  const fileInput = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<Upload | null>(null);

  const [chosenType, setChosenType] = useState<MediaType>('photo');

  const full = value.length >= MAX_MEDIA;
  const busy = disabled || uploading !== null;
  // The question's media decides the type once it has some; until then, the planner's choice.
  const shownType = value.length > 0 ? mediaType(value[0].kind) : chosenType;
  const typeInfo = MEDIA_TYPE_INFO[shownType];

  /** A question has one media item, so a new one takes the place of any already there. */
  const set = (item: QuestionMedia) => {
    setError(null);
    setChosenType(mediaType(item.kind));
    onChange([item]);
  };

  const addLink = (input = link) => {
    const url = input.trim();
    if (!url) return;
    if (!/^https:\/\//i.test(url)) {
      setError('Links must start with https://');
      return;
    }
    const kind = mediaKindFromLink(url);
    if (!kind) {
      setError(
        'Use a YouTube link, or a link to a photo, video or sound clip ending in its file type, such as .jpg, .mp4 or .mp3.',
      );
      return;
    }
    set({ kind, url, name: null });
    setLink('');
  };

  const uploadFile = async (file: File) => {
    const kind: MediaKind | null = mediaKindFromFile(file);
    if (!kind) {
      setError('Upload a photo, video or sound clip.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError('Files can be up to 100 MB.');
      return;
    }
    setError(null);
    setUploading({ name: file.name, percentage: 0 });
    onUploadingChange(true);
    try {
      const url = await uploadQuestionMedia(file, (percentage) =>
        setUploading({ name: file.name, percentage }),
      );
      set({ kind, url, name: file.name });
    } catch (err) {
      setError(getApiErrorMessage(err, `Couldn’t upload ${file.name}. Please try again.`));
    } finally {
      setUploading(null);
      onUploadingChange(false);
    }
  };

  /** A copied file: uploaded, or, before uploads are set up, a copied web photo's link. */
  const pasteFile = (data: DataTransfer) => {
    if (busy) return;
    if (uploadsEnabled) {
      void uploadFile(data.files[0]);
      return;
    }
    const imageLink = imageLinkFromHtml(data.getData('text/html'));
    if (imageLink) set({ kind: 'image', url: imageLink, name: null });
    else setError('File uploads aren’t set up yet, so paste a link instead.');
  };

  // Files are caught before the question editor, which would drop them. Read through a ref so
  // the listener, added once, always sees the latest media.
  const pasteFileRef = useRef(pasteFile);
  pasteFileRef.current = pasteFile;
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (!event.clipboardData?.files.length) return;
      event.preventDefault();
      event.stopPropagation();
      pasteFileRef.current(event.clipboardData);
    };
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, []);

  return (
    <FormField
      label="Media"
      invalid={error !== null}
      errorMessage={error ?? undefined}
    >
      {({ labelId }) => (
        <div
          className={styles.media}
          role="group"
          aria-labelledby={labelId}
        >
          {/* Locked while there's media: remove it to pick another type. */}
          <SegmentedControl
            ariaLabel="Media type"
            value={shownType}
            onChange={(next) => {
              setChosenType(next as MediaType);
              setError(null);
            }}
            options={TYPE_OPTIONS}
            disabled={busy || value.length > 0}
            fullWidth
          />

          {value.length > 0 && (
            <ul className={styles.mediaList}>
              {value.map((item, index) => (
                <li
                  key={`${item.url}-${index}`}
                  className={styles.mediaItem}
                >
                  <MediaPreview item={item} />
                  <span className={styles.mediaName}>
                    <FontAwesomeIcon
                      icon={KIND_ICONS[item.kind]}
                      className={styles.mediaKindIcon}
                    />
                    <span>{mediaLabel(item)}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    intent="danger"
                    icon="delete"
                    size="small"
                    tooltip="Remove"
                    aria-label={`Remove ${mediaLabel(item)}`}
                    disabled={busy}
                    onClick={() => {
                      // Keep its type picked, ready for a replacement.
                      setChosenType(mediaType(item.kind));
                      onChange(value.filter((_, i) => i !== index));
                    }}
                  />
                </li>
              ))}
            </ul>
          )}

          {uploading && (
            <p
              className={styles.fieldHint}
              role="status"
            >
              Uploading {uploading.name}… {Math.round(uploading.percentage)}%
            </p>
          )}

          {!full && (
            <>
              {/* Like the score card's hero image: click to browse, or paste a copied file. */}
              <label
                className={classNames(styles.mediaDrop, {
                  [styles.mediaDropDisabled]: busy || !uploadsEnabled,
                })}
              >
                <FontAwesomeIcon
                  icon={faArrowUpFromBracket}
                  className={styles.mediaDropIcon}
                />
                <span className={styles.mediaDropPrimary}>Upload {typeInfo.title}</span>
                <span className={styles.mediaDropSub}>
                  {uploadsEnabled
                    ? 'Click to browse · or paste from clipboard'
                    : 'File uploads aren’t set up yet'}
                </span>
                <input
                  ref={fileInput}
                  type="file"
                  accept={typeInfo.accept}
                  className={styles.visuallyHidden}
                  aria-label="Upload media"
                  disabled={busy || !uploadsEnabled}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = '';
                    if (file) void uploadFile(file);
                  }}
                />
              </label>

              <div className={styles.mediaAdd}>
                <Input
                  type="url"
                  value={link}
                  onChange={(next) => {
                    setLink(next);
                    setError(null);
                  }}
                  onKeyDown={(event) => {
                    // Enter adds the link instead of submitting the question.
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    addLink();
                  }}
                  onPaste={(event) => {
                    // A link pasted into the empty box is added straight away. If it can't be
                    // used, it stays in the box beside the reason.
                    const pasted = event.clipboardData.getData('text').trim();
                    if (link.trim() || !/^https?:\/\//i.test(pasted)) return;
                    event.preventDefault();
                    setLink(pasted);
                    addLink(pasted);
                  }}
                  placeholder={typeInfo.linkPlaceholder}
                  aria-label="Media link"
                  disabled={busy}
                  className={styles.mediaLinkInput}
                />
                <Button
                  type="button"
                  variant="outlined"
                  intent="neutral"
                  icon="add"
                  size="small"
                  disabled={busy || !link.trim()}
                  onClick={() => addLink()}
                >
                  Add Link
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </FormField>
  );
};

export default QuestionMediaField;
