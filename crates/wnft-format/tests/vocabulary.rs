//! The codes of §6.2 are shared by every implementation, so their spelling is
//! part of the contract, not an implementation detail. This pins it.

use wnft_format::{DEFAULT_LIMITS, ErrorCode, WarningCode};

#[test]
fn error_codes_spell_exactly_what_section_6_2_lists() {
    assert_eq!(ErrorCode::BadMagic.as_str(), "BAD_MAGIC");
    assert_eq!(
        ErrorCode::UnsupportedContainer.as_str(),
        "UNSUPPORTED_CONTAINER"
    );
    assert_eq!(ErrorCode::BadContainer.as_str(), "BAD_CONTAINER");
    assert_eq!(ErrorCode::ChecksumMismatch.as_str(), "CHECKSUM_MISMATCH");
    assert_eq!(ErrorCode::ManifestTooLarge.as_str(), "MANIFEST_TOO_LARGE");
    assert_eq!(ErrorCode::BadManifest.as_str(), "BAD_MANIFEST");
    assert_eq!(
        ErrorCode::UnsupportedFormatVersion.as_str(),
        "UNSUPPORTED_FORMAT_VERSION"
    );
    assert_eq!(
        ErrorCode::UnsupportedExtension.as_str(),
        "UNSUPPORTED_EXTENSION"
    );
    assert_eq!(ErrorCode::BadLayout.as_str(), "BAD_LAYOUT");
    assert_eq!(ErrorCode::LimitExceeded.as_str(), "LIMIT_EXCEEDED");
    assert_eq!(ErrorCode::InconsistentData.as_str(), "INCONSISTENT_DATA");
    // §7.3, the writer's own.
    assert_eq!(ErrorCode::InvalidTarget.as_str(), "INVALID_TARGET");
}

#[test]
fn warning_codes_spell_exactly_what_section_6_2_lists() {
    assert_eq!(
        WarningCode::UnknownChunkSkipped.as_str(),
        "UNKNOWN_CHUNK_SKIPPED"
    );
    assert_eq!(
        WarningCode::UnknownExtensionIgnored.as_str(),
        "UNKNOWN_EXTENSION_IGNORED"
    );
    assert_eq!(
        WarningCode::UnsupportedDescriptorSet.as_str(),
        "UNSUPPORTED_DESCRIPTOR_SET"
    );
}

#[test]
fn default_limits_are_the_ones_section_6_4_suggests() {
    assert_eq!(DEFAULT_LIMITS.max_file_bytes, 64 * 1024 * 1024);
    assert_eq!(DEFAULT_LIMITS.max_manifest_bytes, 1024 * 1024);
    assert_eq!(DEFAULT_LIMITS.max_levels, 32);
    assert_eq!(DEFAULT_LIMITS.max_keypoints, 1_000_000);
    assert_eq!(DEFAULT_LIMITS.max_descriptor_sets, 16);
    assert_eq!(DEFAULT_LIMITS.max_patch_size, 64);
    assert_eq!(DEFAULT_LIMITS.max_patches, 65_536);
}
