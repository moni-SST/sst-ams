const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const isEnabled = () => Boolean(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

// Upload a buffer to Cloudinary (for files uploaded via multer memory storage)
const uploadBuffer = (buffer, options = {}) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream(
    { resource_type: 'auto', ...options },
    (err, result) => err ? reject(err) : resolve(result)
  );
  stream.end(buffer);
});

// Delete by public_id
const destroy = (publicId, options = {}) =>
  cloudinary.uploader.destroy(publicId, { resource_type: 'auto', ...options });

module.exports = { cloudinary, isEnabled, uploadBuffer, destroy };
