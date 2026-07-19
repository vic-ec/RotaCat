// Turns a react-easy-crop pixel crop area into a square JPEG Blob.
// Standard canvas-crop recipe used with react-easy-crop.

function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (err) => reject(err))
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

export async function getCroppedImageBlob(imageSrc, cropPixels, outputSize = 400) {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  canvas.width = outputSize
  canvas.height = outputSize
  const ctx = canvas.getContext('2d')

  ctx.drawImage(
    image,
    cropPixels.x,
    cropPixels.y,
    cropPixels.width,
    cropPixels.height,
    0,
    0,
    outputSize,
    outputSize
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas is empty'))),
      'image/jpeg',
      0.92
    )
  })
}
