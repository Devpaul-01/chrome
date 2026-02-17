-- Migration: Add font customization fields to posts table
-- Description: Adds font_family, font_size, and font_color columns to support text styling on images

-- Add new columns to posts table
ALTER TABLE posts 
ADD COLUMN font_family TEXT DEFAULT 'Arial',
ADD COLUMN font_size INTEGER DEFAULT 48,
ADD COLUMN font_color TEXT DEFAULT '#ffffff';

-- Update existing posts to have default values (already set by DEFAULT, but explicit for clarity)
UPDATE posts 
SET font_family = 'Arial', 
    font_size = 48, 
    font_color = '#ffffff'
WHERE font_family IS NULL;

-- Add constraints to ensure valid values
ALTER TABLE posts 
ADD CONSTRAINT check_font_size_range CHECK (font_size >= 24 AND font_size <= 96);

-- Create comment for documentation
COMMENT ON COLUMN posts.font_family IS 'Font family for text overlay on post images';
COMMENT ON COLUMN posts.font_size IS 'Font size in pixels (24-96) for text overlay on post images';
COMMENT ON COLUMN posts.font_color IS 'Hex color code for text overlay on post images';
