import { mapPlatformFolderToExperienceMedia } from './platform-folder-media.mapper';

describe('mapPlatformFolderToExperienceMedia', () => {
  it('maps non-archived photo/video URLs and folder content fields', () => {
    const mapped = mapPlatformFolderToExperienceMedia({
      folder: {
        name: 'Diwali Night',
        categoryId: 'cat-1',
        subcategoryId: 'sub-1',
        description: 'Festive dinner',
        userBenefits: 'Live music',
        termsAndConditions: 'No outside food',
        tags: ['festive', 'dinner'],
      },
      media: [
        { kind: 'PHOTO', url: 'https://cdn.example/a.jpg', isArchived: false },
        { kind: 'PHOTO', url: 'https://cdn.example/b.jpg', isArchived: true },
        { kind: 'VIDEO', url: 'https://cdn.example/v.mp4', isArchived: false },
      ],
    });

    expect(mapped).toEqual({
      name: 'Diwali Night',
      description: 'Festive dinner',
      categoryId: 'cat-1',
      subCategoryId: 'sub-1',
      userBenefits: 'Live music',
      termsAndConditions: 'No outside food',
      tags: ['festive', 'dinner'],
      photos: ['https://cdn.example/a.jpg'],
      photoThumbnails: ['https://cdn.example/a.jpg'],
      videos: ['https://cdn.example/v.mp4'],
      promotionalVideos: [],
    });
  });

  it('does not invent lineage identifiers', () => {
    const mapped = mapPlatformFolderToExperienceMedia({
      folder: {
        name: 'X',
        categoryId: 'c',
        subcategoryId: 's',
        description: '',
        userBenefits: '',
        termsAndConditions: '',
        tags: [],
      },
      media: [],
    });
    expect(mapped).not.toHaveProperty('sourceFolderId');
    expect(mapped).not.toHaveProperty('platformFolderId');
  });
});
