import ProductDetail from '../models/ProductDetail.js';
import Review from '../models/Review.js';
import AdminAction from '../models/AdminAction.js';
import RentalDetail from '../models/RentalDetail.js';
import { toPublicUrl } from '../utils/media.js';
import { isElevatedRole } from '../utils/roles.js';
import { storeUploadedImage } from '../services/mediaStorageService.js';

const LOW_STOCK_THRESHOLD = 2;

function normalizeRatingsInput(ratings) {
  if (!Array.isArray(ratings)) {
    return [];
  }

  return ratings
    .map((entry) => ({
      reviewerName: String(entry?.reviewerName || 'Anonymous Customer').trim() || 'Anonymous Customer',
      score: Number(entry?.score),
      comment: String(entry?.comment || '').trim(),
      createdAt: entry?.createdAt || undefined,
    }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score >= 1 && entry.score <= 5)
    .map((entry) => ({
      ...entry,
      score: Number(entry.score),
    }));
}

function computeAverageRating(ratings, fallbackRating = 0) {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return typeof fallbackRating === 'number' && Number.isFinite(fallbackRating) ? fallbackRating : 0;
  }

  const total = ratings.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
  return Number((total / ratings.length).toFixed(1));
}

function buildAdminName(email) {
  const prefix = String(email || '').split('@')[0] || 'Admin';
  return prefix
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ') || 'Admin';
}

async function logAdminAction(req, payload) {
  try {
    await AdminAction.create({
      adminId: String(req.user?.id || ''),
      adminEmail: String(req.user?.email || ''),
      adminLabel: buildAdminName(req.user?.email || ''),
      action: payload.action,
      targetUserId: payload.targetUserId || '',
      targetRole: payload.targetRole || '',
      details: payload.details || null
    });
  } catch (error) {
    console.error('inventory logAdminAction error:', error);
  }
}

function normalizeProductResponse(req, product) {
  if (!product) {
    return product;
  }

  const plainProduct = typeof product.toJSON === 'function' ? product.toJSON() : { ...product };

  if (plainProduct._id && !plainProduct.id) {
    plainProduct.id = plainProduct._id;
  }

  delete plainProduct._id;
  delete plainProduct.__v;

  plainProduct.image = toPublicUrl(req, plainProduct.image);

  return plainProduct;
}

function normalizePublicProductResponse(req, product) {
  const normalizedProduct = normalizeProductResponse(req, product);
  if (!normalizedProduct) {
    return normalizedProduct;
  }

  if (normalizedProduct.status === 'rented') {
    normalizedProduct.status = 'available';
  }

  return normalizedProduct;
}

async function applyReviewSnapshots(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return items;
  }

  const productIds = items
    .map((item) => String(item.id || item._id || '').trim())
    .filter(Boolean);

  if (productIds.length === 0) {
    return items.map((item) => ({ ...item, rating: 0, ratings: [] }));
  }

  const reviews = await Review.find({ productId: { $in: productIds } })
    .select('productId customerName score comment createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const reviewMap = new Map();

  reviews.forEach((review) => {
    const productId = String(review.productId || '');
    if (!reviewMap.has(productId)) {
      reviewMap.set(productId, []);
    }

    reviewMap.get(productId).push({
      reviewerName: String(review.customerName || '').trim() || 'Anonymous Customer',
      score: Number(review.score || 0),
      comment: String(review.comment || '').trim(),
      createdAt: review.createdAt || undefined,
    });
  });

  return items.map((item) => {
    const productReviews = reviewMap.get(String(item.id || item._id || '')) || [];

    return {
      ...item,
      ratings: productReviews,
      rating: computeAverageRating(productReviews, 0),
    };
  });
}

function computeBranchPerformance(items, branchName) {
  const totalProducts = items.length;
  const totalStockUnits = items.reduce((sum, item) => sum + (item.stock ?? 0), 0);
  const availableProducts = items.filter((item) => item.status === 'available').length;
  const rentedProducts = items.filter((item) => item.status === 'rented').length;
  const lowStockItems = items.filter((item) => (item.stock ?? 0) > 0 && (item.stock ?? 0) <= LOW_STOCK_THRESHOLD).length;
  const outOfStockItems = items.filter((item) => (item.stock ?? 0) === 0).length;
  const totalItemsSold = items.reduce((sum, item) => sum + (item.totalSold ?? 0), 0);
  const inventoryValue = items.reduce((sum, item) => sum + ((item.price ?? 0) * (item.stock ?? 0)), 0);
  const activeRentals = rentedProducts;

  // Inventory turnover is estimated when no dedicated sales table exists.
  const inventoryTurnoverRate = totalProducts > 0 ? Number((rentedProducts / totalProducts).toFixed(2)) : 0;

  return {
    branch: branchName,
    totalProducts,
    totalStockUnits,
    availableProducts,
    rentedProducts,
    activeRentals,
    lowStockItems,
    outOfStockItems,
    totalItemsSold,
    inventoryTurnoverRate,
    inventoryValue
  };
}

async function releaseStaleReservedProducts() {
  const productIdsWithActiveRentals = await RentalDetail.distinct('productId', {
    status: 'active'
  });

  const activeCounts = await RentalDetail.aggregate([
    {
      $match: {
        status: 'active'
      }
    },
    {
      $group: {
        _id: '$productId',
        count: { $sum: 1 }
      }
    }
  ]);

  const activeCountByProductId = new Map(
    activeCounts.map((row) => [String(row._id), Number(row.count || 0)])
  );

  await ProductDetail.updateMany(
    {
      status: 'reserved',
      _id: { $nin: productIdsWithActiveRentals }
    },
    { $set: { status: 'available' } }
  );

  // Keep product status aligned with actual capacity: available while active rentals are below stock.
  const potentiallyStaleProducts = await ProductDetail.find({
    status: { $in: ['reserved', 'rented'] },
    _id: { $in: productIdsWithActiveRentals }
  }).select('_id status stock').lean();

  const bulkUpdates = potentiallyStaleProducts
    .map((product) => {
      const activeCount = activeCountByProductId.get(String(product._id)) || 0;
      const stock = Math.max(0, Number(product.stock || 0));
      const nextStatus = stock > 0 && activeCount < stock ? 'available' : 'rented';

      if (nextStatus === product.status) {
        return null;
      }

      return {
        updateOne: {
          filter: { _id: product._id },
          update: { $set: { status: nextStatus, updatedAt: new Date() } }
        }
      };
    })
    .filter(Boolean);

  if (bulkUpdates.length > 0) {
    await ProductDetail.bulkWrite(bulkUpdates);
  }
}

// Generate next SKU like G001, G002, ...
async function generateSKU() {
  const products = await ProductDetail.find({ sku: /^G\d+$/ }, { sku: 1 }).lean();
  if (products.length === 0) {
    return 'G001';
  }

  const usedNumbers = new Set(
    products
      .map((p) => Number.parseInt(String(p.sku).slice(1), 10))
      .filter((n) => Number.isInteger(n) && n > 0)
  );

  let next = Math.max(...usedNumbers) + 1;
  while (usedNumbers.has(next)) {
    next += 1;
  }

  return `G${String(next).padStart(3, '0')}`;
}

export async function uploadImage(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const storedImage = await storeUploadedImage(req.file, { folder: 'products' });
    res.json({ url: toPublicUrl(req, storedImage.url) });
  } catch (err) {
    console.error('uploadImage error:', err);
    res.status(500).json({ message: 'Failed to upload image' });
  }
}

export async function getInventory(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await releaseStaleReservedProducts();

    const items = await ProductDetail.find({ status: { $ne: 'archived' } })
      .sort({ createdAt: -1 })
      .lean();
    const mapped = items.map((item) => normalizeProductResponse(req, item));
    const withReviews = await applyReviewSnapshots(mapped);
    res.json({ items: withReviews });
  } catch (err) {
    console.error('getInventory error:', err);
    res.status(500).json({ message: 'Failed to fetch inventory' });
  }
}

export async function getPublicInventory(req, res) {
  try {
    await releaseStaleReservedProducts();

    const items = await ProductDetail.find({ status: { $ne: 'archived' } })
      .sort({ createdAt: -1 })
      .lean();
    const mapped = items.map((item) => normalizePublicProductResponse(req, item));
    const withReviews = await applyReviewSnapshots(mapped);
    res.json({ items: withReviews });
  } catch (err) {
    console.error('getPublicInventory error:', err);
    res.status(500).json({ message: 'Failed to fetch catalog inventory' });
  }
}

export async function getArchivedProducts(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const items = await ProductDetail.find({ status: 'archived' })
      .sort({ deletedAt: -1, updatedAt: -1 })
      .lean();
    const mapped = items.map((item) => normalizeProductResponse(req, item));
    res.json({ items: mapped });
  } catch (err) {
    console.error('getArchivedProducts error:', err);
    res.status(500).json({ message: 'Failed to fetch archived products' });
  }
}

export async function getBranchInventory(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { branchId } = req.params;
    const branchName = decodeURIComponent(branchId).trim();
    if (!branchName) {
      return res.status(400).json({ message: 'Branch is required' });
    }

    const items = await ProductDetail.find({
      status: { $ne: 'archived' },
      branch: branchName
    }).sort({ createdAt: -1 }).lean();

    const mappedItems = items.map((item) => normalizeProductResponse(req, item));
    const stats = computeBranchPerformance(mappedItems, branchName);

    res.json({
      branch: branchName,
      stats,
      items: mappedItems
    });
  } catch (err) {
    console.error('getBranchInventory error:', err);
    res.status(500).json({ message: 'Failed to fetch branch inventory' });
  }
}

export async function getBranchPerformance(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const items = await ProductDetail.find({ status: { $ne: 'archived' } })
      .sort({ createdAt: -1 })
      .lean();
    const mappedItems = items.map((item) => normalizeProductResponse(req, item));

    const grouped = new Map();
    for (const item of mappedItems) {
      const branch = item.branch || 'Unknown';
      if (!grouped.has(branch)) {
        grouped.set(branch, []);
      }
      grouped.get(branch).push(item);
    }

    const branches = Array.from(grouped.entries())
      .map(([branchName, branchItems]) => computeBranchPerformance(branchItems, branchName))
      .sort((a, b) => a.branch.localeCompare(b.branch));

    const summary = {
      totalProducts: branches.reduce((sum, row) => sum + row.totalProducts, 0),
      totalStockUnits: branches.reduce((sum, row) => sum + row.totalStockUnits, 0),
      availableProducts: branches.reduce((sum, row) => sum + row.availableProducts, 0),
      rentedProducts: branches.reduce((sum, row) => sum + row.rentedProducts, 0),
      activeRentals: branches.reduce((sum, row) => sum + row.activeRentals, 0),
      lowStockItems: branches.reduce((sum, row) => sum + row.lowStockItems, 0),
      outOfStockItems: branches.reduce((sum, row) => sum + row.outOfStockItems, 0),
      totalItemsSold: branches.reduce((sum, row) => sum + row.totalItemsSold, 0),
      inventoryValue: branches.reduce((sum, row) => sum + row.inventoryValue, 0),
      inventoryTurnoverRate:
        branches.length > 0
          ? Number((branches.reduce((sum, row) => sum + row.inventoryTurnoverRate, 0) / branches.length).toFixed(2))
          : 0
    };

    res.json({ branches, summary });
  } catch (err) {
    console.error('getBranchPerformance error:', err);
    res.status(500).json({ message: 'Failed to fetch branch performance' });
  }
}

export async function createProduct(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
        const { name, category, color, size, price, branch, status, lastRented,
          description, image, rating, ratings, stock } = req.body;

    if (!name || !category || !color || price === undefined || !branch) {
      return res.status(400).json({ message: 'Missing required fields: name, category, color, price, branch' });
    }
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ message: 'Price must be a non-negative number' });
    }

    const normalizedRatings = normalizeRatingsInput(ratings);

    const sku = await generateSKU();
    const product = new ProductDetail({
      sku,
      name: name.trim(),
      category: category.trim(),
      color: color.trim(),
      size: Array.isArray(size) ? size : [],
      price,
      branch,
      status: status || 'available',
      lastRented: lastRented || null,
      description: description ? description.trim() : '',
      image: image ? image.trim() : '',
      rating: computeAverageRating(normalizedRatings, typeof rating === 'number' ? rating : 0),
      ratings: normalizedRatings,
      stock: typeof stock === 'number' ? stock : 1,
      deletedAt: null
    });
    await product.save();

    await logAdminAction(req, {
      action: 'inventory_created',
      targetUserId: `${product.name || 'Unnamed Gown'} (${product.sku || 'NO-SKU'})`,
      targetRole: 'Inventory',
      details: {
        gownName: product.name || '',
        sku: product.sku || '',
        branch: product.branch || '',
        category: product.category || '',
        status: product.status || '',
        stock: Number(product.stock || 0),
        price: Number(product.price || 0)
      }
    });

    const obj = normalizeProductResponse(req, product);
    res.status(201).json({ item: obj });
  } catch (err) {
    console.error('createProduct error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Failed to create product' });
  }
}

export async function updateProduct(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id } = req.params;
        const { name, category, color, size, price, branch, status, lastRented,
          description, image, rating, ratings, stock } = req.body;

    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      return res.status(400).json({ message: 'Price must be a non-negative number' });
    }

    const normalizedRatings = ratings !== undefined ? normalizeRatingsInput(ratings) : null;

    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (category !== undefined) updates.category = category.trim();
    if (color !== undefined) updates.color = color.trim();
    if (size !== undefined) updates.size = Array.isArray(size) ? size : [];
    if (price !== undefined) updates.price = price;
    if (branch !== undefined) updates.branch = branch;
    if (status !== undefined) updates.status = status;
    if (lastRented !== undefined) updates.lastRented = lastRented || null;
    if (description !== undefined) updates.description = description.trim();
    if (image !== undefined) updates.image = image.trim();
    if (normalizedRatings !== null) {
      updates.ratings = normalizedRatings;
      updates.rating = computeAverageRating(normalizedRatings, typeof rating === 'number' ? rating : 0);
    } else if (rating !== undefined) {
      updates.rating = rating;
    }
    if (stock !== undefined) updates.stock = stock;
    updates.updatedAt = new Date();

    const product = await ProductDetail.findOneAndUpdate({
      _id: id,
      status: { $ne: 'archived' }
    }, updates, {
      new: true,
      runValidators: true
    });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await logAdminAction(req, {
      action: 'inventory_updated',
      targetUserId: `${product.name || 'Unnamed Gown'} (${product.sku || 'NO-SKU'})`,
      targetRole: 'Inventory',
      details: {
        gownName: product.name || '',
        sku: product.sku || '',
        branch: product.branch || '',
        category: product.category || '',
        status: product.status || '',
        stock: Number(product.stock || 0),
        price: Number(product.price || 0)
      }
    });

    res.json({ item: normalizeProductResponse(req, product) });
  } catch (err) {
    console.error('updateProduct error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: 'Failed to update product' });
  }
}

export async function deleteProduct(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { id } = req.params;
    const product = await ProductDetail.findOneAndUpdate(
      {
        _id: id,
        status: { $ne: 'archived' }
      },
      {
        $set: {
          status: 'archived',
          deletedAt: new Date(),
          updatedAt: new Date()
        },
        $unset: {
          isDeleted: '',
          archived: ''
        }
      },
      { new: true }
    );
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    await logAdminAction(req, {
      action: 'inventory_archived',
      targetUserId: `${product.name || 'Unnamed Gown'} (${product.sku || 'NO-SKU'})`,
      targetRole: 'Inventory',
      details: {
        status: 'archived'
      }
    });

    res.json({ message: 'Product archived successfully' });
  } catch (err) {
    console.error('deleteProduct error:', err);
    res.status(500).json({ message: 'Failed to delete product' });
  }
}

export async function restoreProduct(req, res) {
  try {
    if (!isElevatedRole(req.user.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { id } = req.params;
    const product = await ProductDetail.findOneAndUpdate(
      {
        _id: id,
        status: 'archived'
      },
      {
        $set: {
          status: 'available',
          deletedAt: null,
          updatedAt: new Date()
        },
        $unset: {
          isDeleted: '',
          archived: ''
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    if (!product) {
      return res.status(404).json({ message: 'Archived product not found' });
    }

    await logAdminAction(req, {
      action: 'inventory_restored',
      targetUserId: `${product.name || 'Unnamed Gown'} (${product.sku || 'NO-SKU'})`,
      targetRole: 'Inventory',
      details: {
        status: 'available'
      }
    });

    res.json({ item: normalizeProductResponse(req, product), message: 'Product restored successfully' });
  } catch (err) {
    console.error('restoreProduct error:', err);
    res.status(500).json({ message: 'Failed to restore product' });
  }
}
