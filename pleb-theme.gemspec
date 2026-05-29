# pleb-theme.gemspec
Gem::Specification.new do |spec|
  spec.name          = "pleb-theme"
  spec.version       = "1.0.0"
  spec.authors       = ["Otto Brinkmeier"]
  spec.summary       = "The unified theme for all Plebware projects."
  spec.license       = "MIT"

  spec.files         = `git ls-files -z`.split("\x0").select { |f| f.match(%r{^(_layouts|_includes|_sass|assets)/) } }
  spec.require_paths = ["."]
end
