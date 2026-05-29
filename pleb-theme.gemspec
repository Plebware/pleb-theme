Gem::Specification.new do |spec|
  spec.name          = "pleb-theme"
  spec.version       = "1.0.0"
  spec.authors       = ["Otto Brinkmeier"]
  spec.summary       = "Unified theme for Plebware projects"
  spec.license       = "MIT"

  spec.files         = `git ls-files -z`.split("\x0").select { |f| f.match(%r{^(_layouts|_includes|assets)/}) }
  spec.require_paths = ["."]
end
